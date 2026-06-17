// Wrapper for serial communication with our robotic antenna tracker.
// Protocol: ASCII CSV lines, either "S,<STATE>\n" or "V,<azimuth>,<elevation>\n"

use std::io::{Read, Write};
use std::sync::mpsc as std_mpsc;
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use tokio_util::sync::CancellationToken;

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum TrackerState {
    Idle,
    Calibrate,
    Absolute,
    Remote,
}

impl TrackerState {
    fn as_serial_str(&self) -> &'static str {
        match self {
            TrackerState::Idle => "IDLE",
            TrackerState::Calibrate => "CALIBRATE",
            TrackerState::Absolute => "ABSOLUTE",
            TrackerState::Remote => "REMOTE",
        }
    }
}

pub enum TrackerCommand {
    SetState(TrackerState),
    // In Absolute mode: azimuth/elevation in radians (position).
    // In Remote mode: azimuth/elevation in rad/s (velocity).
    SetValues { azimuth: f32, elevation: f32 },
}

// ── Handle (cheap to clone, handed to the rest of the app) ───────────────────

#[derive(Clone)]
pub struct TrackerHandle {
    pub port_tx: mpsc::Sender<String>,
    pub command_tx: mpsc::Sender<TrackerCommand>,
}

impl TrackerHandle {
    pub async fn send_state(&self, state: TrackerState) -> Result<(), String> {
        self.command_tx
            .send(TrackerCommand::SetState(state))
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn send_values(&self, azimuth: f32, elevation: f32) -> Result<(), String> {
        self.command_tx
            .send(TrackerCommand::SetValues { azimuth, elevation })
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn send_serial_port(&self, port: String) -> Result<(), String> {
        println!("[tracker] queue serial port selection: {port}");
        self.port_tx.send(port).await.map_err(|e| e.to_string())
    }

    pub fn available_ports() -> Vec<String> {
        serialport::available_ports()
            .unwrap_or_default()
            .into_iter()
            .map(|p| p.port_name)
            .collect()
    }
}

// ── Constructor ───────────────────────────────────────────────────────────────

pub fn new() -> (TrackerInterface, TrackerHandle) {
    let (port_tx, port_rx) = mpsc::channel::<String>(8);
    let (command_tx, command_rx) = mpsc::channel::<TrackerCommand>(32);
    let handle = TrackerHandle { port_tx, command_tx };
    let interface = TrackerInterface {
        port_rx,
        command_rx,
        baud_rate: 115200,
    };
    (interface, handle)
}

// ── Actor (runs on its own async task) ───────────────────────────────────────

pub struct TrackerInterface {
    port_rx: mpsc::Receiver<String>,
    command_rx: mpsc::Receiver<TrackerCommand>,
    baud_rate: u32,
}

impl TrackerInterface {
    pub async fn run(mut self, shutdown_rx: CancellationToken) {
        let mut current_port: Option<String> = None;

        loop {
            if current_port.is_none() {
                tokio::select! {
                    _ = shutdown_rx.cancelled() => {
                        println!("[tracker] shutdown before port selected");
                        return;
                    }
                    Some(port) = self.port_rx.recv() => {
                        println!("[tracker] received serial port selection: {port}");
                        current_port = Some(port);
                    }
                }
            }

            let port_name = current_port.take().unwrap();
            match self.run_connected(&port_name, &shutdown_rx).await {
                RunResult::Shutdown => {
                    println!("[tracker] clean shutdown");
                    return;
                }
                RunResult::PortChanged(new_port) => {
                    println!("[tracker] switching to {new_port}");
                    current_port = Some(new_port);
                }
                RunResult::Error(e) => {
                    eprintln!("[tracker] error on {port_name}: {e}. Retrying in 2s...");
                    current_port = Some(port_name);
                    tokio::select! {
                        _ = sleep(Duration::from_secs(2)) => {}
                        _ = shutdown_rx.cancelled() => return,
                        Some(new_port) = self.port_rx.recv() => {
                            println!("[tracker] received port change while retrying: {new_port}");
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
        println!("[tracker] opening serial port {port_name} at {} baud", self.baud_rate);
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

        let (line_tx, mut line_rx) =
            tokio::sync::mpsc::unbounded_channel::<Result<String, String>>();
        let (write_tx, write_rx) = std_mpsc::channel::<Vec<u8>>();

        // ── Reader thread ─────────────────────────────────────────────────────
        let reader_line_tx = line_tx.clone();
        std::thread::spawn(move || {
            let mut buf = vec![0u8; 256];
            let mut accumulator = String::new();

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        let _ = reader_line_tx.send(Err("port closed".into()));
                        return;
                    }
                    Ok(n) => {
                        if let Ok(chunk) = std::str::from_utf8(&buf[..n]) {
                            accumulator.push_str(chunk);
                            while let Some(pos) = accumulator.find('\n') {
                                let line = accumulator.drain(..=pos).collect::<String>();
                                let line = line.trim().to_string();
                                if !line.is_empty() && reader_line_tx.send(Ok(line)).is_err() {
                                    return;
                                }
                            }
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::TimedOut => continue,
                    Err(e) => {
                        let _ = reader_line_tx.send(Err(e.to_string()));
                        return;
                    }
                }
            }
        });

        // ── Writer thread ─────────────────────────────────────────────────────
        let writer_line_tx = line_tx;
        std::thread::spawn(move || {
            let mut writer = writer;
            while let Ok(data) = write_rx.recv() {
                if let Err(e) = writer.write_all(&data) {
                    let _ = writer_line_tx.send(Err(e.to_string()));
                    return;
                }
            }
        });

        println!("[tracker] connected to {port_name}");

        // ── Select loop ───────────────────────────────────────────────────────
        loop {
            tokio::select! {
                _ = shutdown_rx.cancelled() => {
                    return RunResult::Shutdown;
                }
                Some(new_port) = self.port_rx.recv() => {
                    println!("[tracker] received serial port change: {new_port}");
                    return RunResult::PortChanged(new_port);
                }
                Some(cmd) = self.command_rx.recv() => {
                    let msg = match cmd {
                        TrackerCommand::SetState(state) => {
                            format!("S,{}\n", state.as_serial_str())
                        }
                        TrackerCommand::SetValues { azimuth, elevation } => {
                            format!("V,{},{}\n", azimuth, elevation)
                        }
                    };
                    if write_tx.send(msg.into_bytes()).is_err() {
                        return RunResult::Error("writer thread died".into());
                    }
                }
                result = line_rx.recv() => {
                    match result {
                        Some(Ok(line)) => println!("[tracker] recv: {line}"),
                        Some(Err(e)) => return RunResult::Error(e),
                        None => return RunResult::Error("reader thread died".into()),
                    }
                }
            }
        }
    }
}

// ── Internal result type ──────────────────────────────────────────────────────

enum RunResult {
    Shutdown,
    PortChanged(String),
    Error(String),
}
