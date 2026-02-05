// Specifically for encoding/writing video into MJPEG files

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::io::Write;
use std::process::{Command, Stdio};
use tauri::async_runtime;
use uuid::Uuid;
use tokio::sync::mpsc;



use crate::middleware::video_streams::VideoFrame;

pub type EncoderId = Uuid;

enum VideoCommand {
    Start {
        path: String,
        width: u32,
        height: u32,
        fps: i32,
    },
    Frame(VideoFrame),
    Stop,
}

pub struct EncoderManager {
    encoders: Mutex<HashMap<EncoderId, Arc<VideoEncoder>>>,
}

impl EncoderManager {
    pub fn new() -> Self {
        Self {
            encoders: Mutex::new(HashMap::new()),
        }
    }

    pub fn create_encoder(&self) -> EncoderId {
        let id = uuid::Uuid::new_v4();
        let encoder = Arc::new(VideoEncoder::new());

        self.encoders.lock().unwrap().insert(id, encoder);
        id
    }

    pub fn start(
        &self,
        id: EncoderId,
        path: String,
        width: u32,
        height: u32,
        fps: i32,
    ) -> Result<(), String> {
        let enc = {
            let encoders = self.encoders.lock().unwrap();
            encoders.get(&id).cloned()
        }.ok_or("Encoder not found")?;
        enc.start(path, width, height, fps)
    }

    pub fn send_frame(
        &self,
        id: EncoderId,
        frame: VideoFrame,
    ) -> Result<(), String> {
        let enc = {
            let encoders = self.encoders.lock().unwrap();
            encoders.get(&id).cloned()
        }.ok_or("Encoder not found")?;
        enc.send_frame(frame)
    }

    pub fn stop(&self, id: EncoderId) -> Result<(), String> {
        let enc = {
            let encoders = self.encoders.lock().unwrap();
            encoders.get(&id).cloned()
        }.ok_or("Encoder not found")?;
        enc.stop()
    }

    pub fn remove_encoder(&self, id: EncoderId) -> Result<(), String> {
        if let Some(enc) = self.encoders.lock().unwrap().remove(&id) {
            enc.stop()?;
        }
        Ok(())
    }
}

#[derive (Clone)]
pub struct VideoEncoder {
    tx: mpsc::Sender<VideoCommand>,
}

impl VideoEncoder {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(32);
        spawn_encoder_task(rx);
        Self { tx }
    }

    pub fn start(
        &self,
        path: impl Into<String>,
        width: u32,
        height: u32,
        fps: i32,
    ) -> Result<(), String> {
        self.tx
            .try_send(VideoCommand::Start { 
                path: path.into(), 
                width, 
                height, 
                fps 
            })
            .map_err(|e| e.to_string())
    }

    pub fn send_frame(&self, frame: VideoFrame) -> Result<(), String> {
        self.tx
            .try_send(VideoCommand::Frame(frame))
            .map_err(|e| e.to_string())
    }
    
    pub fn stop(&self) -> Result<(), String> {
        self.tx
            .try_send(VideoCommand::Stop)
            .map_err(|e| e.to_string())
    }
}

// private function to help spawn a thread for a encoder
fn spawn_encoder_task(mut rx: mpsc::Receiver<VideoCommand>) {
    async_runtime::spawn_blocking(move || {
        // Optional: print FFmpeg initialization
        println!("Starting MJPEG encoder thread...");

        let mut child: Option<std::process::Child> = None;
        let mut stdin: Option<std::process::ChildStdin> = None;
        let mut width = 0;
        let mut height = 0;
        let mut fps = 0;

        while let Some(cmd) = rx.blocking_recv() {
            match cmd {
                VideoCommand::Start {
                    path,
                    width: w,
                    height: h,
                    fps: f,
                } => {
                    // Ignore if already running
                    if child.is_some() {
                        continue;
                    }

                    width = w;
                    height = h;
                    fps = f;

                    // Spawn FFmpeg subprocess for MJPEG encoding
                    let mut ffmpeg = Command::new("ffmpeg")
                        .args(&[
                            "-y",                     // overwrite output
                            "-f", "rawvideo",         // input format
                            "-pix_fmt", "rgb24",      // pixel format
                            "-s", &format!("{}x{}", width, height), // resolution
                            "-r", &fps.to_string(),   // frame rate
                            "-i", "-",                // input from stdin
                            "-c:v", "mjpeg",          // MJPEG codec
                            "-q:v", "5",              // quality (1-31, lower is better)
                            &path,                    // output file
                        ])
                        .stdin(Stdio::piped())
                        .spawn()
                        .expect("Failed to spawn ffmpeg process");

                    stdin = ffmpeg.stdin.take();
                    child = Some(ffmpeg);

                    println!("FFmpeg encoder started: {}", path);
                }

                VideoCommand::Frame(frame) => {
                    if let Some(stdin) = stdin.as_mut() {
                        // Write RGB frame bytes directly to FFmpeg stdin
                        if frame.data.len() != (width * height * 3) as usize {
                            eprintln!("Frame size mismatch!");
                            continue;
                        }

                        if let Err(e) = stdin.write_all(&frame.data) {
                            eprintln!("Failed to write frame to ffmpeg stdin: {}", e);
                        }
                    }
                }

                VideoCommand::Stop => {
                    if let Some(mut stdin) = stdin.take() {
                        // Close stdin to signal EOF
                        let _ = stdin.flush();
                        // let _ = stdin.shutdown();
                        drop(stdin); // signals to close
                    }

                    if let Some(mut child) = child.take() {
                        // Wait for FFmpeg to finish encoding
                        let _ = child.wait();
                        println!("FFmpeg encoding finished");
                    }
                }
            }
        }
    });
}