

extern crate flatbuffers;

#[allow(dead_code, unused_imports)]
#[path = "../../telemetry-generated/Packet_generated.rs"]
mod packet_generated;
pub use packet_generated::hprc;

use std::io::{Read, Write};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::sync::broadcast;
use std::sync::mpsc as std_mpsc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
use crate::middleware::telemetry_stores::TelemetryData;
use crate::middleware::{self, Middleware};

const CALLSIGN: &[u8] = &[b'K', b'V', b'0', b'R'];
const HEADER_LEN: usize = CALLSIGN.len() + 1; // magic + length byte



// this is cheap to clone and is handed out to remotely control the telemetry radio
// for sending control commands and choosing the serial port
#[derive(Clone)]
pub struct TelemetryRadioHandle {
    pub command_tx: mpsc::Sender<hprc::Command>,
    pub port_tx: mpsc::Sender<String>,
}

impl TelemetryRadioHandle {
    // gives us a list of available serial ports
    pub fn available_ports() -> Vec<String> {
        serialport::available_ports()
            .unwrap_or_default()
            .into_iter()
            .map(|p| p.port_name)
            .collect()
    }

    pub async fn send_command(&self, cmd: hprc::Command) -> Result<(), String> {
        self.command_tx.send(cmd).await.map_err(|e| e.to_string())
    }

    pub async fn send_serial_port(&self, port: String) -> Result<(), String> {
        self.port_tx.send(port).await.map_err(|e| e.to_string())
    }
}


// ── Constructor ───────────────────────────────────────────────────────────────

pub fn new(
    middleware: Arc<Mutex<Middleware>>,
) -> (TelemetryRadio, TelemetryRadioHandle) {
    let (command_tx, command_rx) = mpsc::channel::<hprc::Command>(32);
    let (port_tx, port_rx) = mpsc::channel::<String>(32);
    let handle = TelemetryRadioHandle { command_tx, port_tx };
    let radio = TelemetryRadio { middleware, port_rx, command_rx, baud_rate: 115200, command_sent_count: 0 };
    (radio, handle)
}

// ── Actor (Thread) ─────────────────────────────────────────────────────────────────────

pub struct TelemetryRadio {
    middleware: Arc<Mutex<Middleware>>,
    port_rx: mpsc::Receiver<String>,
    command_rx: mpsc::Receiver<hprc::Command>,
    baud_rate: u32,
    command_sent_count: u16,
}

impl TelemetryRadio {
    pub async fn run(mut self, mut shutdown_rx: broadcast::Receiver<()>) {
        let mut current_port: Option<String> = None;

        loop {
            if current_port.is_none() {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        tracing::info!("telem_radio: shutdown before port selected");
                        return;
                    }
                    Some(port) = self.port_rx.recv() => {
                        current_port = Some(port);
                    }
                }
            }

            let port_name = current_port.take().unwrap();
            match self.run_connected(&port_name, &mut shutdown_rx).await {
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
                        _ = shutdown_rx.recv() => return,
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
        shutdown_rx: &mut broadcast::Receiver<()>,
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
                    Ok(0) => { let _ = reader_frame_tx.send(Err("port closed".into())); return; }
                    Ok(n) => {
                        accumulator.extend_from_slice(&buf[..n]);
                    
                        loop {
                            // Find the magic header
                            let Some(start) = accumulator.windows(CALLSIGN.len())
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
                                tracing::warn!("telem_radio: discarding {} bytes before magic", start);
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
                    Err(e) => { let _ = reader_frame_tx.send(Err(e.to_string())); return; }
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
                _ = shutdown_rx.recv() => {
                    return RunResult::Shutdown;
                }
                Some(new_port) = self.port_rx.recv() => {
                    return RunResult::PortChanged(new_port);
                }
                Some(cmd) = self.command_rx.recv() => {
                    let mut builder = flatbuffers::FlatBufferBuilder::with_capacity(32);

                    // build command flatbuffer
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
        let payload = &frame[HEADER_LEN..];

        if let Ok(packet) = hprc::root_as_packet(&payload) {
            let mut middleware  = self.middleware.lock().await;
            match packet.packet_type() {
                hprc::PacketUnion::Rocket30KTelemetryPacket => self.handle_rocket30_kpacket(&mut middleware, packet.packet_as_rocket_30_ktelemetry_packet().unwrap()),
                hprc::PacketUnion::Rocket2StageTelemetryPacket => self.handle_rocket2_stage_packet(&mut middleware, packet.packet_as_rocket_2_stage_telemetry_packet().unwrap()),
                hprc::PacketUnion::RocketCanardsTelemetryPacket => self.handle_rocket_canards_packet(&mut middleware, packet.packet_as_rocket_canards_telemetry_packet().unwrap()),
                hprc::PacketUnion::PayloadTelemetryPacket => self.handle_payload_packet(&mut middleware, packet.packet_as_payload_telemetry_packet().unwrap()),
                _ => ()
            }
        }

    }

    fn handle_rocket30_kpacket(&self, middleware: &mut tokio::sync::MutexGuard<'_, Middleware>, packet: hprc::Rocket30KTelemetryPacket<'_>) {
        let _ = middleware.push_data("rocket", "state", TelemetryData::new().with_value(packet.state().0 as u32));

        if let Some(shared) = packet.shared() {self.handle_shared(middleware, shared, "rocket".to_string());};
        if let Some(sensors) = packet.sensor_values() {self.handle_sensors(middleware, sensors, "rocket".to_string());};
        if let Some(gps) = packet.gps_values() {self.handle_gps(middleware, gps, "rocket".to_string());};
        if let Some(ekf) = packet.ekf_values() {self.handle_ekf(middleware, ekf, "rocket".to_string());};
    }

    fn handle_rocket2_stage_packet(&self, middleware: &mut tokio::sync::MutexGuard<'_, Middleware>, packet: hprc::Rocket2StageTelemetryPacket<'_>) {
        let _ = middleware.push_data("rocket", "state", TelemetryData::new().with_value(packet.state().0 as u32));

        if let Some(shared) = packet.shared() {self.handle_shared(middleware, shared, "rocket".to_string());};
        if let Some(sensors) = packet.sensor_values() {self.handle_sensors(middleware, sensors, "rocket".to_string());};
        if let Some(gps) = packet.gps_values() {self.handle_gps(middleware, gps, "rocket".to_string());};
        if let Some(ekf) = packet.ekf_values() {self.handle_ekf(middleware, ekf, "rocket".to_string());};

        // if let Some(airbrakes) = packet.airbrakes() {
            // airbrakes.commanded();
            // airbrakes.actual();
        // }
        

    }

    fn handle_rocket_canards_packet(&self, middleware: &mut tokio::sync::MutexGuard<'_, Middleware>, packet: hprc::RocketCanardsTelemetryPacket<'_>) {
        let _ = middleware.push_data("rocket", "state", TelemetryData::new().with_value(packet.state().0 as u32));

        if let Some(shared) = packet.shared() {self.handle_shared(middleware, shared, "rocket".to_string());};
        if let Some(sensors) = packet.sensor_values() {self.handle_sensors(middleware, sensors, "rocket".to_string());};
        if let Some(gps) = packet.gps_values() {self.handle_gps(middleware, gps, "rocket".to_string());};
        if let Some(ekf) = packet.ekf_values() {self.handle_ekf(middleware, ekf, "rocket".to_string());};

        if let Some(canard1) = packet.canard1() {
            let _ = middleware.push_data("rocket", "canard 1 commanded", TelemetryData::new().with_value(canard1.commanded() as f64));
            let _ = middleware.push_data("rocket", "canard 1 actual", TelemetryData::new().with_value(canard1.actual() as f64));
        }
        if let Some(canard2) = packet.canard2() {
            let _ = middleware.push_data("rocket", "canard 2 commanded", TelemetryData::new().with_value(canard2.commanded() as f64));
            let _ = middleware.push_data("rocket", "canard 2 actual", TelemetryData::new().with_value(canard2.actual() as f64));
        }
        if let Some(canard3) = packet.canard3() {
            let _ = middleware.push_data("rocket", "canard 3 commanded", TelemetryData::new().with_value(canard3.commanded() as f64));
            let _ = middleware.push_data("rocket", "canard 3 actual", TelemetryData::new().with_value(canard3.actual() as f64));
        }
        if let Some(canard4) = packet.canard4() {
            let _ = middleware.push_data("rocket", "canard 4 commanded", TelemetryData::new().with_value(canard4.commanded() as f64));
            let _ = middleware.push_data("rocket", "canard 4 actual", TelemetryData::new().with_value(canard4.actual() as f64));
        }


        if let Some(covariance) = packet.covariance_diagonal() {
            // idk lol
        }

    }

    fn handle_payload_packet(&self, middleware: &mut tokio::sync::MutexGuard<'_, Middleware>, packet: hprc::PayloadTelemetryPacket<'_>) {
        
        let _ = middleware.push_data("payload", "state", TelemetryData::new().with_value(packet.state().0 as u32));

        if let Some(shared) = packet.shared() {self.handle_shared(middleware, shared, "payload".to_string());};
        if let Some(sensors) = packet.sensor_values() {self.handle_sensors(middleware, sensors, "payload".to_string());};
        if let Some(gps) = packet.gps_values() {self.handle_gps(middleware, gps, "payload".to_string());};
        if let Some(ekf) = packet.ekf_values() {self.handle_ekf(middleware, ekf, "payload".to_string());};

        // TO:DO: finish implementation
    }

    fn handle_shared(&self, middleware: &mut tokio::sync::MutexGuard<'_, Middleware>, shared: &hprc::Shared, name: String){
        let _ = middleware.push_data(&name, "timestamp", TelemetryData::new().with_value(shared.time_from_boot()));
        let _ = middleware.push_data(&name, "loop count", TelemetryData::new().with_value(shared.loop_count()));
        let _ = middleware.push_data(&name, "sd file no", TelemetryData::new().with_value(shared.sd_file_no()as i32));
        let _ = middleware.push_data(&name, "battery voltage", TelemetryData::new().with_value(shared.battery_voltage() as f64));
    }

    fn handle_sensors(&self, middleware: &mut tokio::sync::MutexGuard<'_, Middleware>, sensors: &hprc::Sensors, name: String){
        let _ = middleware.push_data(&name, "acc 1 x", TelemetryData::new().with_value(sensors.acc_1_x() as f64));
        let _ = middleware.push_data(&name, "acc 1 y", TelemetryData::new().with_value(sensors.acc_1_y() as f64));
        let _ = middleware.push_data(&name, "acc 1 z", TelemetryData::new().with_value(sensors.acc_1_z() as f64));
        let _ = middleware.push_data(&name, "acc 2 x", TelemetryData::new().with_value(sensors.acc_2_x() as f64));
        let _ = middleware.push_data(&name, "acc 2 y", TelemetryData::new().with_value(sensors.acc_2_y() as f64));
        let _ = middleware.push_data(&name, "acc 2 z", TelemetryData::new().with_value(sensors.acc_2_z() as f64));
        let _ = middleware.push_data(&name, "gyro 1 x", TelemetryData::new().with_value(sensors.gyro_1_x() as f64));
        let _ = middleware.push_data(&name, "gyro 1 y", TelemetryData::new().with_value(sensors.gyro_1_y() as f64));
        let _ = middleware.push_data(&name, "gyro 1 z", TelemetryData::new().with_value(sensors.gyro_1_z() as f64));
        let _ = middleware.push_data(&name, "gyro 2 x", TelemetryData::new().with_value(sensors.gyro_2_x() as f64));
        let _ = middleware.push_data(&name, "gyro 2 y", TelemetryData::new().with_value(sensors.gyro_2_y() as f64));
        let _ = middleware.push_data(&name, "gyro 2 z", TelemetryData::new().with_value(sensors.gyro_2_z() as f64));
        let _ = middleware.push_data(&name, "mag x", TelemetryData::new().with_value(sensors.mag_x() as f64));
        let _ = middleware.push_data(&name, "mag y", TelemetryData::new().with_value(sensors.mag_y() as f64));
        let _ = middleware.push_data(&name, "mag z", TelemetryData::new().with_value(sensors.mag_z() as f64));
        let _ = middleware.push_data(&name, "pressure", TelemetryData::new().with_value(sensors.pressure() as f64));
        let _ = middleware.push_data(&name, "temperature", TelemetryData::new().with_value(sensors.temperature() as f64));
    }

    fn handle_gps(&self, middleware: &mut tokio::sync::MutexGuard<'_, Middleware>, gps: &hprc::GPS, name: String){
        let _ = middleware.push_data(&name, "gps lock", TelemetryData::new().with_value(gps.has_lock()));
        let _ = middleware.push_data(&name, "satellites", TelemetryData::new().with_value(gps.satellites() as u32));
        let _ = middleware.push_data(&name, "ecef x", TelemetryData::new().with_value(gps.ecef_x()));
        let _ = middleware.push_data(&name, "ecef y", TelemetryData::new().with_value(gps.ecef_y()));
        let _ = middleware.push_data(&name, "ecef z", TelemetryData::new().with_value(gps.ecef_z()));
        let _ = middleware.push_data(&name, "latitude", TelemetryData::new().with_value(gps.latitude()));
        let _ = middleware.push_data(&name, "longitude", TelemetryData::new().with_value(gps.longitude()));
        let _ = middleware.push_data(&name, "gps altitude", TelemetryData::new().with_value(gps.altitude()));
    }

    fn handle_ekf(&self, middleware: &mut tokio::sync::MutexGuard<'_, Middleware>, ekf: &hprc::EKF, name: String){
        let _ = middleware.push_data(&name, "w", TelemetryData::new().with_value(ekf.w() as f64));
        let _ = middleware.push_data(&name, "i", TelemetryData::new().with_value(ekf.i() as f64));
        let _ = middleware.push_data(&name, "j", TelemetryData::new().with_value(ekf.j() as f64));
        let _ = middleware.push_data(&name, "k", TelemetryData::new().with_value(ekf.k() as f64));
        let _ = middleware.push_data(&name, "pos x", TelemetryData::new().with_value(ekf.pos_x() as f64));
        let _ = middleware.push_data(&name, "pos y", TelemetryData::new().with_value(ekf.pos_y() as f64));
        let _ = middleware.push_data(&name, "pos z", TelemetryData::new().with_value(ekf.pos_z() as f64));
        let _ = middleware.push_data(&name, "vel x", TelemetryData::new().with_value(ekf.vel_x() as f64));
        let _ = middleware.push_data(&name, "vel y", TelemetryData::new().with_value(ekf.vel_y() as f64));
        let _ = middleware.push_data(&name, "vel z", TelemetryData::new().with_value(ekf.vel_z() as f64));
    }
}



// ── Internal result type ──────────────────────────────────────────────────────

enum RunResult {
    Shutdown,
    PortChanged(String),
    Error(String),
}





