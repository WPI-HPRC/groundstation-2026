extern crate flatbuffers;


#[path = "../../telemetry-generated/Packet_generated.rs"]
mod packet_generated;
pub use packet_generated::hprc;
use tokio_util::sync::CancellationToken;

use crate::middleware::telemetry_stores::TelemetryData;
use crate::middleware::{Middleware};
use std::io::{Read, Write};
use std::sync::mpsc as std_mpsc;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
// #[allow(dead_code, unused_assignments, unused_variables)]

const CALLSIGN: &[u8] = &[b'K', b'V', b'0', b'R'];
const HEADER_LEN: usize = CALLSIGN.len() + 1; // magic + length byte

// this is cheap to clone and is handed out to remotely control the telemetry radio
// for sending control commands and choosing the serial port
#[derive(Clone)]
pub struct TelemetryRadioHandle {
    pub command_tx: mpsc::Sender<hprc::Command>,
    pub port_tx: mpsc::Sender<String>,
    pub payload_control_tx: mpsc::Sender<(f32, f32)>
}

impl TelemetryRadioHandle {

    pub async fn send_command(&self, cmd: hprc::Command) -> Result<(), String> {
        self.command_tx.send(cmd).await.map_err(|e| e.to_string())
    }
    // gives us a list of available serial ports
    pub fn available_ports() -> Vec<String> {
        serialport::available_ports()
            .unwrap_or_default()
            .into_iter()
            .map(|p| p.port_name)
            .collect()
    }

    pub async fn send_payload_control(&self, drive: f32, rotation: f32) -> Result<(), String> {
        self.payload_control_tx.send((drive, rotation)).await.map_err(|e| e.to_string())
    }

    pub async fn send_serial_port(&self, port: String) -> Result<(), String> {
        self.port_tx.send(port).await.map_err(|e| e.to_string())
    }
}

// ── Constructor ───────────────────────────────────────────────────────────────

pub fn new(middleware: Arc<Mutex<Middleware>>) -> (TelemetryRadio, TelemetryRadioHandle) {
    let (command_tx, command_rx) = mpsc::channel::<hprc::Command>(32);
    let (payload_control_tx, payload_control_rx) = mpsc::channel::<(f32, f32)>(32);
    let (port_tx, port_rx) = mpsc::channel::<String>(32);
    let handle = TelemetryRadioHandle {
        command_tx,
        port_tx,
        payload_control_tx,
    };
    let radio = TelemetryRadio {
        middleware,
        port_rx,
        command_rx,
        payload_control_rx,
        baud_rate: 115200,
        command_sent_count: 0,
    };
    (radio, handle)
}

// ── Actor (Thread) ─────────────────────────────────────────────────────────────────────

pub struct TelemetryRadio {
    middleware: Arc<Mutex<Middleware>>,
    port_rx: mpsc::Receiver<String>,
    command_rx: mpsc::Receiver<hprc::Command>,
    payload_control_rx: mpsc::Receiver<(f32, f32)>,
    baud_rate: u32,
    command_sent_count: u16,
}

impl TelemetryRadio {
    pub async fn run(mut self, shutdown_rx: CancellationToken) {
        let mut current_port: Option<String> = None;


        loop {
            if current_port.is_none() {
                tokio::select! {
                    _ = shutdown_rx.cancelled() => {
                        tracing::info!("telem_radio: shutdown before port selected");
                        return;
                    }
                    Some(port) = self.port_rx.recv() => {
                        current_port = Some(port);
                    }
                }
            }

            let port_name = current_port.take().unwrap();
            match self.run_connected(&port_name, &shutdown_rx).await {
                RunResult::Shutdown => {
                    tracing::info!("telem_radio: clean shutdown");
                    return;
                }
                RunResult::PortChanged(new_port) => {
                    tracing::info!("telem_radio: switching to {new_port}");
                    current_port = Some(new_port);
                }
                RunResult::Error(e) => {
                    tracing::error!("telem_radio: error on {port_name}: {e}. Retrying in 2s...");
                    current_port = Some(port_name);
                    tokio::select! {
                        _ = sleep(Duration::from_secs(2)) => {}
                        _ = shutdown_rx.cancelled() => return,
                        Some(new_port) = self.port_rx.recv() => {
                            current_port = Some(new_port);
                        }
                    }
                }
            }
        }
    }

    async fn run_connected(
        &mut self,
        port_name: &str,
        shutdown_rx: &CancellationToken,
    ) -> RunResult {
        let port = match serialport::new(port_name, self.baud_rate)
            .timeout(Duration::from_millis(100))
            .open()
        {
            Ok(p) => p,
            Err(e) => return RunResult::Error(e.to_string()),
        };

        let writer = match port.try_clone() {
            Ok(p) => p,
            Err(e) => return RunResult::Error(format!("clone failed: {e}")),
        };
        let mut reader = port;

        // Unbounded so the reader thread can send without blocking on the runtime
        let (frame_tx, mut frame_rx) =
            tokio::sync::mpsc::unbounded_channel::<Result<Vec<u8>, String>>();

        // Write channel — std mpsc, receiver lives on the writer thread
        let (write_tx, write_rx) = std_mpsc::channel::<Vec<u8>>();

        // ── Reader thread ─────────────────────────────────────────────────────
        let reader_frame_tx = frame_tx.clone();
        std::thread::spawn(move || {
            let mut buf = vec![0u8; 1024];
            let mut accumulator: Vec<u8> = Vec::new();

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        let _ = reader_frame_tx.send(Err("port closed".into()));
                        return;
                    }
                    Ok(n) => {
                        accumulator.extend_from_slice(&buf[..n]);

                        loop {
                            // Find the magic header
                            let Some(start) = accumulator
                                .windows(CALLSIGN.len())
                                .position(|w| w == CALLSIGN)
                            else {
                                // No magic found — discard everything except the last
                                // (CALLSIGN.len() - 1) bytes in case magic is split across reads
                                if accumulator.len() > CALLSIGN.len() {
                                    accumulator.drain(..accumulator.len() - (CALLSIGN.len() - 1));
                                }
                                break;
                            };

                            // Discard anything before the magic
                            if start > 0 {
                                tracing::warn!(
                                    "telem_radio: discarding {} bytes before magic",
                                    start
                                );
                                accumulator.drain(..start);
                            }

                            // Do we have enough bytes to read the length?
                            if accumulator.len() < HEADER_LEN {
                                break; // wait for more data
                            }

                            let payload_len = accumulator[CALLSIGN.len()] as usize;
                            let total_len = HEADER_LEN + payload_len;

                            // Do we have the full packet?
                            if accumulator.len() < total_len {
                                break; // wait for more data
                            }

                            // Extract the complete packet and send it
                            let packet = accumulator.drain(..total_len).collect::<Vec<u8>>();
                            if reader_frame_tx.send(Ok(packet)).is_err() {
                                return;
                            }
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::TimedOut => continue,
                    Err(e) => {
                        let _ = reader_frame_tx.send(Err(e.to_string()));
                        return;
                    }
                }
            }
        });

        // ── Writer thread ─────────────────────────────────────────────────────
        let writer_frame_tx = frame_tx;
        std::thread::spawn(move || {
            let mut writer = writer;
            while let Ok(cmd) = write_rx.recv() {
                if let Err(e) = writer.write_all(&cmd) {
                    let _ = writer_frame_tx.send(Err(e.to_string()));
                    return;
                }
            }
        });

        tracing::info!("telem_radio: connected to {port_name}");

        // ── Select loop ───────────────────────────────────────────────────────
        loop {
            tokio::select! {
                _ = shutdown_rx.cancelled() => {
                    return RunResult::Shutdown;
                }
                Some(new_port) = self.port_rx.recv() => {
                    return RunResult::PortChanged(new_port);
                }
                Some(payload_control) = self.payload_control_rx.recv() => {
                    let mut builder = flatbuffers::FlatBufferBuilder::with_capacity(32);

                    // build the command
                    let (throttle, rotation) = payload_control;
                    let control_pack = hprc::PayloadControlPacket::create(&mut builder, &hprc::PayloadControlPacketArgs{
                        throttle: throttle,
                        rotation: rotation, 
                    });

                    let command_packet = hprc::Packet::create(&mut builder, &mut hprc::PacketArgs{
                        packet_type: hprc::PacketUnion::PayloadControlPacket,
                        packet: Some(control_pack.as_union_value()),
                    });

                    builder.finish(command_packet, None);

                    // add framing
                    let mut send_buffer: Vec<u8> = Vec::new();
                    send_buffer.extend_from_slice(CALLSIGN); // magic header/callsign
                    send_buffer.push(builder.finished_data().len() as u8); // length
                    send_buffer.extend_from_slice(builder.finished_data());

                    if write_tx.send(send_buffer).is_err() {
                        return RunResult::Error("writer thread died".into());
                    }
                }
                Some(cmd) = self.command_rx.recv() => {
                    let mut builder = flatbuffers::FlatBufferBuilder::with_capacity(32);

                    // build command flatbuffer
                    self.command_sent_count += 1; // iterate our command sent count
                    let command_pack = hprc::RemoteControlCommand::create(&mut builder, &hprc::RemoteControlCommandArgs{
                        command: cmd,
                        command_number: self.command_sent_count,
                    });

                    let command_packet = hprc::Packet::create(&mut builder, &mut hprc::PacketArgs{
                        packet_type: hprc::PacketUnion::RemoteControl,
                        packet: Some(command_pack.as_union_value()),
                    });

                    builder.finish(command_packet, None);
                    

                    // add framing
                    let mut send_buffer: Vec<u8> = Vec::new();
                    send_buffer.extend_from_slice(CALLSIGN); // magic header/callsign
                    send_buffer.push(builder.finished_data().len() as u8); // length
                    send_buffer.extend_from_slice(builder.finished_data());

                    if write_tx.send(send_buffer).is_err() {
                        return RunResult::Error("writer thread died".into());
                    }

                }
                result = frame_rx.recv() => {
                    match result {
                        Some(Ok(frame)) => self.handle_frame(frame).await,
                        Some(Err(e)) => return RunResult::Error(e),
                        None => return RunResult::Error("reader thread died".into()),
                    }
                }
            }
        }
    }

    async fn handle_frame(&self, frame: Vec<u8>) {
        tracing::debug!("telem_radio: rx {} bytes", frame.len());

        // take off framing header
        let frame_payload = &frame[HEADER_LEN..];

        if let Ok(packet) = hprc::root_as_packet(&frame_payload) {
            let mut middleware = self.middleware.lock().await;
            match packet.packet_type() {
                hprc::PacketUnion::Rocket30KTelemetryPacket => self.handle_rocket30_kpacket(
                    &mut middleware,
                    // .unwrap() is safe here bc we've already type matched in the match statement
                    packet.packet_as_rocket_30_ktelemetry_packet().unwrap(), 
                ),
                hprc::PacketUnion::Rocket2StageTelemetryPacket => self.handle_rocket2_stage_packet(
                    &mut middleware,
                    // .unwrap() is safe here bc we've already type matched in the match statement
                    packet.packet_as_rocket_2_stage_telemetry_packet().unwrap(),
                ),
                hprc::PacketUnion::RocketCanardsTelemetryPacket => self.handle_rocket_canards_packet(
                        &mut middleware,
                        // .unwrap() is safe here bc we've already type matched in the match statement
                        packet.packet_as_rocket_canards_telemetry_packet().unwrap(),
                    ),
                hprc::PacketUnion::PayloadTelemetryPacket => self.handle_payload_packet(
                    &mut middleware,
                    // .unwrap() is safe here bc we've already type matched in the match statement
                    packet.packet_as_payload_telemetry_packet().unwrap(),
                ),
                _ => (),
            }
        }
    }

    fn handle_rocket30_kpacket(
        &self,
        middleware: &mut tokio::sync::MutexGuard<'_, Middleware>,
        packet: hprc::Rocket30KTelemetryPacket<'_>,
    ) {
        let _ = middleware.push_data(
            "rocket",
            "state",
            TelemetryData::new().with_value(packet.state().0 as u32),
        );

        if let Some(shared) = packet.shared() {
            self.handle_shared(middleware, shared, "rocket".to_string());
        };
        if let Some(sensors) = packet.sensor_values() {
            self.handle_sensors(middleware, &sensors, "rocket".to_string());
        };
        if let Some(ekf) = packet.ekf_values() {
            self.handle_ekf(middleware, ekf, "rocket".to_string());
        };

        if let Some(covariance) = packet.covariance_diagonal() {
            let mut covariance_index = 0;
            for val in covariance {
                let _ = middleware.push_data(
                    "rocket",
                    &format!("covariance_diagonal{}",covariance_index).to_string(), 
                    TelemetryData::new().with_value(val as f64),
                );
                covariance_index +=1;
            };
        };
    }

    fn handle_rocket2_stage_packet(
        &self,
        middleware: &mut tokio::sync::MutexGuard<'_, Middleware>,
        packet: hprc::Rocket2StageTelemetryPacket<'_>,
    ) {
        let _ = middleware.push_data(
            "rocket",
            "state",
            TelemetryData::new().with_value(packet.state().0 as u32),
        );

        if let Some(shared) = packet.shared() {
            self.handle_shared(middleware, shared, "rocket".to_string());
        };
        if let Some(sensors) = packet.sensor_values() {
            self.handle_sensors(middleware, &sensors, "rocket".to_string());
        };
        if let Some(ekf) = packet.ekf_values() {
            self.handle_ekf(middleware, ekf, "rocket".to_string());
        };

        // if let Some(airbrakes) = packet.airbrakes() {
        // airbrakes.commanded();
        // airbrakes.actual();
        // }
    }

    fn handle_rocket_canards_packet(
        &self,
        middleware: &mut tokio::sync::MutexGuard<'_, Middleware>,
        packet: hprc::RocketCanardsTelemetryPacket<'_>,
    ) {
        let _ = middleware.push_data(
            "rocket",
            "state",
            TelemetryData::new().with_value(packet.state().0 as u32),
        );

        if let Some(shared) = packet.shared() {
            self.handle_shared(middleware, shared, "rocket".to_string());
        };
        if let Some(sensors) = packet.sensor_values() {
            self.handle_sensors(middleware, &sensors, "rocket".to_string());
        };
        if let Some(ekf) = packet.ekf_values() {
            self.handle_ekf(middleware, ekf, "rocket".to_string());
        };

        if let Some(canard1) = packet.canard1() {
            let _ = middleware.push_data(
                "rocket",
                "canard 1 commanded",
                TelemetryData::new().with_value(canard1.commanded() as f64),
            );
            let _ = middleware.push_data(
                "rocket",
                "canard 1 actual",
                TelemetryData::new().with_value(canard1.actual() as f64),
            );
        }
        if let Some(canard2) = packet.canard2() {
            let _ = middleware.push_data(
                "rocket",
                "canard 2 commanded",
                TelemetryData::new().with_value(canard2.commanded() as f64),
            );
            let _ = middleware.push_data(
                "rocket",
                "canard 2 actual",
                TelemetryData::new().with_value(canard2.actual() as f64),
            );
        }
        if let Some(canard3) = packet.canard3() {
            let _ = middleware.push_data(
                "rocket",
                "canard 3 commanded",
                TelemetryData::new().with_value(canard3.commanded() as f64),
            );
            let _ = middleware.push_data(
                "rocket",
                "canard 3 actual",
                TelemetryData::new().with_value(canard3.actual() as f64),
            );
        }
        if let Some(canard4) = packet.canard4() {
            let _ = middleware.push_data(
                "rocket",
                "canard 4 commanded",
                TelemetryData::new().with_value(canard4.commanded() as f64),
            );
            let _ = middleware.push_data(
                "rocket",
                "canard 4 actual",
                TelemetryData::new().with_value(canard4.actual() as f64),
            );
        }

        if let Some(covariance) = packet.covariance_diagonal() {
            let mut covariance_index = 0;
            for val in covariance {
                let _ = middleware.push_data(
                    "rocket",
                    &format!("covariance {}",covariance_index).to_string(), 
                    TelemetryData::new().with_value(val as f64),
                );
                covariance_index +=1;
            };
        };
    }

    fn handle_payload_packet(
        &self,
        middleware: &mut tokio::sync::MutexGuard<'_, Middleware>,
        packet: hprc::PayloadTelemetryPacket<'_>,
    ) {
        let _ = middleware.push_data(
            "payload",
            "state",
            TelemetryData::new().with_value(packet.state().0 as u32),
        );

        if let Some(shared) = packet.shared() {
            self.handle_shared(middleware, shared, "payload".to_string());
        };
        if let Some(sensors) = packet.sensor_values() {
            self.handle_sensors(middleware, &sensors, "payload".to_string());
        };
        if let Some(ekf) = packet.ekf_values() {
            self.handle_ekf(middleware, ekf, "payload".to_string());
        };

        // TO:DO: finish implementation
    }

    fn handle_shared(
        &self,
        middleware: &mut tokio::sync::MutexGuard<'_, Middleware>,
        shared: &hprc::Shared,
        name: String,
    ) {
        let _ = middleware.push_data(
            &name,
            "time_from_boot",
            TelemetryData::new().with_value(shared.time_from_boot()),
        );
        let _ = middleware.push_data(
            &name,
            "loop_count",
            TelemetryData::new().with_value(shared.loop_count()),
        );
        let _ = middleware.push_data(
            &name,
            "sd_file_no",
            TelemetryData::new().with_value(shared.sd_file_no() as i32),
        );
        let _ = middleware.push_data(
            &name,
            "battery_voltage",
            TelemetryData::new().with_value(shared.battery_voltage() as f64),
        );
        let _ = middleware.push_data(
            &name,
            "mosfet_current",
            TelemetryData::new().with_value(shared.mosfet_current() as f64),
        );
        let _ = middleware.push_data(
            &name,
            "mosfet_state",
            TelemetryData::new().with_value(shared.mosfet_state()),
        );
        let _ = middleware.push_data(
            &name,
            "last_command_received",
            TelemetryData::new().with_value(shared.last_command_received() as u32),
        );
    }

    fn handle_sensors(
        &self,
        middleware: &mut tokio::sync::MutexGuard<'_, Middleware>,
        sensors: &hprc::Sensors,
        name: String,
    ) {
        if let Some(asm330_data) = sensors.asm330() {
            let _ = middleware.push_data(
                &name,
                "asm330_accel0",
                TelemetryData::new().with_value(asm330_data.accel0() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "asm330_accel1",
                TelemetryData::new().with_value(asm330_data.accel1() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "asm330_accel2",
                TelemetryData::new().with_value(asm330_data.accel2() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "asm330_gyr0",
                TelemetryData::new().with_value(asm330_data.gyr0() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "asm330_gyr1",
                TelemetryData::new().with_value(asm330_data.gyr1() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "asm330_gyr2",
                TelemetryData::new().with_value(asm330_data.gyr2() as f64),
            );
        }

        if let Some(lsm6_data) = sensors.lsm6() {
            let _ = middleware.push_data(
                &name,
                "lsm6_accel0",
                TelemetryData::new().with_value(lsm6_data.accel0() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "lsm6_accel1",
                TelemetryData::new().with_value(lsm6_data.accel1() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "lsm6_accel2",
                TelemetryData::new().with_value(lsm6_data.accel2() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "lsm6_gyr0",
                TelemetryData::new().with_value(lsm6_data.gyr0() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "lsm6_gyr1",
                TelemetryData::new().with_value(lsm6_data.gyr1() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "lsm6_gyr2",
                TelemetryData::new().with_value(lsm6_data.gyr2() as f64),
            );
        }

        if let Some(lis2mdl_data) = sensors.lis2mdl() {
            let _ = middleware.push_data(
                &name,
                "mag0",
                TelemetryData::new().with_value(lis2mdl_data.mag0() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "mag1",
                TelemetryData::new().with_value(lis2mdl_data.mag1() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "mag2",
                TelemetryData::new().with_value(lis2mdl_data.mag2() as f64),
            );
        }

        if let Some(lps22_data) = sensors.lps22() {
            let _ = middleware.push_data(
                &name,
                "pressure",
                TelemetryData::new().with_value(lps22_data.pressure() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "temp",
                TelemetryData::new().with_value(lps22_data.temp() as f64),
            );
        }

        if let Some(liv3f_data) = sensors.liv3f() {
            let _ = middleware.push_data(
                &name,
                "gps_lock",
                TelemetryData::new().with_value(liv3f_data.satellites() >= 3),
            );
            let _ = middleware.push_data(
                &name,
                "satellites",
                TelemetryData::new().with_value(liv3f_data.satellites() as u32),
            );
            let _ = middleware.push_data(
                &name,
                "lat",
                TelemetryData::new().with_value(liv3f_data.lat() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "lon",
                TelemetryData::new().with_value(liv3f_data.lon() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "alt",
                TelemetryData::new().with_value(liv3f_data.alt() as f64),
            );
            let _ = middleware.push_data(
                &name,
                "epoch_time",
                TelemetryData::new().with_value(liv3f_data.epoch_time()),
            );
        }
    }

    fn handle_ekf(
        &self,
        middleware: &mut tokio::sync::MutexGuard<'_, Middleware>,
        ekf: &hprc::EKF,
        name: String,
    ) {
        let _ = middleware.push_data(&name, "w", TelemetryData::new().with_value(ekf.w() as f64));
        let _ = middleware.push_data(&name, "i", TelemetryData::new().with_value(ekf.i() as f64));
        let _ = middleware.push_data(&name, "j", TelemetryData::new().with_value(ekf.j() as f64));
        let _ = middleware.push_data(&name, "k", TelemetryData::new().with_value(ekf.k() as f64));
        let _ = middleware.push_data(
            &name,
            "pos_x",
            TelemetryData::new().with_value(ekf.pos_x() as f64),
        );
        let _ = middleware.push_data(
            &name,
            "pos_y",
            TelemetryData::new().with_value(ekf.pos_y() as f64),
        );
        let _ = middleware.push_data(
            &name,
            "pos_z",
            TelemetryData::new().with_value(ekf.pos_z() as f64),
        );
        let _ = middleware.push_data(
            &name,
            "vel_x",
            TelemetryData::new().with_value(ekf.vel_x() as f64),
        );
        let _ = middleware.push_data(
            &name,
            "vel_y",
            TelemetryData::new().with_value(ekf.vel_y() as f64),
        );
        let _ = middleware.push_data(
            &name,
            "vel_z",
            TelemetryData::new().with_value(ekf.vel_z() as f64),
        );
    }
}

// ── Internal result type ──────────────────────────────────────────────────────

enum RunResult {
    Shutdown,
    PortChanged(String),
    Error(String),
}
