use nokhwa::{
    pixel_format::RgbFormat,
    query,
    utils::{ApiBackend, CameraIndex, CameraFormat, FrameFormat, RequestedFormat, RequestedFormatType, Resolution},
    Camera,
};
use std::{
    sync::Arc,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::{mpsc, Mutex};
use tokio_util::sync::CancellationToken;

use crate::middleware::{Middleware, video_streams::VideoFrame};

// ── Constants ─────────────────────────────────────────────────────────────────

const PREFERRED_WIDTH: u32 = 1920;
const PREFERRED_HEIGHT: u32 = 1080;
const PREFERRED_FPS: u32 = 60;

// ── Format helpers ────────────────────────────────────────────────────────────

fn build_requested_format() -> RequestedFormat<'static> {
    RequestedFormat::new::<RgbFormat>(RequestedFormatType::Closest(
        CameraFormat::new(
            Resolution::new(PREFERRED_WIDTH, PREFERRED_HEIGHT),
            FrameFormat::YUYV,
            PREFERRED_FPS,
        )
    ))
}

fn open_camera_with_fallback(index: CameraIndex) -> Result<Camera, String> {
    match Camera::new(index.clone(), build_requested_format()) {
        Ok(c) => Ok(c),
        Err(e) => {
            eprintln!("[video] YUYV 1080p60 unavailable ({e}), trying MJPEG");
            let mjpeg = RequestedFormat::new::<RgbFormat>(RequestedFormatType::Closest(
                CameraFormat::new(
                    Resolution::new(PREFERRED_WIDTH, PREFERRED_HEIGHT),
                    FrameFormat::MJPEG,
                    PREFERRED_FPS,
                )
            ));
            match Camera::new(index.clone(), mjpeg) {
                Ok(c) => Ok(c),
                Err(e) => {
                    eprintln!("[video] MJPEG also unavailable ({e}), falling back to default");
                    Camera::new(
                        index,
                        RequestedFormat::new::<RgbFormat>(
                            RequestedFormatType::AbsoluteHighestFrameRate,
                        ),
                    )
                    .map_err(|e| e.to_string())
                }
            }
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

pub struct CameraInput {
    stream_name: String,
    middleware: Arc<Mutex<Middleware>>,
    device_rx: mpsc::Receiver<String>,
}

pub struct CameraHandle {
    device_tx: mpsc::Sender<String>,
}

pub fn new(
    stream_name: impl Into<String>,
    middleware: Arc<Mutex<Middleware>>,
) -> (CameraInput, CameraHandle) {
    let (device_tx, device_rx) = mpsc::channel(1);
    let input = CameraInput {
        stream_name: stream_name.into(),
        middleware,
        device_rx,
    };
    let handle = CameraHandle { device_tx };
    (input, handle)
}

// ── CameraInput ───────────────────────────────────────────────────────────────

impl CameraInput {
    pub async fn run(mut self, shutdown: CancellationToken) {
        let mut pending: Option<String> = None;

        loop {
            let device = if let Some(d) = pending.take() {
                d
            } else {
                tokio::select! {
                    d = self.device_rx.recv() => match d {
                        Some(d) => d,
                        None => return,
                    },
                    _ = shutdown.cancelled() => return,
                }
            };

            let index = match parse_device_index(&device) {
                Ok(i) => i,
                Err(e) => {
                    eprintln!("[video] Invalid device '{device}': {e}");
                    continue;
                }
            };

            let stream_name = self.stream_name.clone();
            let middleware = self.middleware.clone();
            let device_clone = device.clone();

            let (stop_tx, mut stop_rx) = mpsc::channel::<()>(1);
            let (frame_tx, mut frame_rx) = mpsc::channel::<Arc<VideoFrame>>(32);

            // Blocking capture thread
            let join = thread::spawn(move || {
                let mut camera = match open_camera_with_fallback(index) {
                    Ok(c) => c,
                    Err(e) => {
                        eprintln!("[video] Failed to open {device_clone}: {e}");
                        return;
                    }
                };

                if let Err(e) = camera.open_stream() {
                    eprintln!("[video] Failed to open stream for {device_clone}: {e}");
                    return;
                }

                eprintln!(
                    "[video] Opened {device_clone} at {}x{} @ {}fps {:?}",
                    camera.resolution().width_x,
                    camera.resolution().height_y,
                    camera.frame_rate(),
                    camera.frame_format(),
                );

                loop {
                    if stop_rx.try_recv().is_ok() {
                        let _ = camera.stop_stream();
                        eprintln!("[video] Stopped {device_clone}");
                        break;
                    }

                    let buffer = match camera.frame() {
                        Ok(f) => f,
                        Err(e) => {
                            eprintln!("[video] Frame capture error on {device_clone}: {e}");
                            continue;
                        }
                    };

                    let decoded = match buffer.decode_image::<RgbFormat>() {
                        Ok(img) => img,
                        Err(e) => {
                            eprintln!("[video] Decode error on {device_clone}: {e}");
                            continue;
                        }
                    };

                    let resolution = camera.resolution();
                    let timestamp = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as i64;

                    let frame = Arc::new(VideoFrame {
                        timestamp,
                        data: decoded.into_raw(),
                        width: resolution.width_x,
                        height: resolution.height_y,
                    });

                    if frame_tx.blocking_send(frame).is_err() {
                        break; // receiver dropped, shutting down
                    }
                }
            });

            // Async side: push frames to middleware, watch for device swap or shutdown
            tokio::select! {
                _ = async {
                    while let Some(frame) = frame_rx.recv().await {
                        if let Err(e) = middleware.lock().await.process_video_frame(&stream_name, frame) {
                            eprintln!("[video] process_video_frame error: {e}");
                        }
                    }
                } => {},
                d = self.device_rx.recv() => {
                    let _ = stop_tx.send(()).await;
                    let _ = tokio::task::spawn_blocking(|| join.join()).await;
                    pending = d;
                },
                _ = shutdown.cancelled() => {
                    let _ = stop_tx.send(()).await;
                    let _ = tokio::task::spawn_blocking(|| join.join()).await;
                    return;
                }
            }
        }
    }
}

// ── CameraHandle ──────────────────────────────────────────────────────────────

impl CameraHandle {
    pub async fn set_device(&self, device: String) -> Result<(), String> {
        self.device_tx
            .send(device)
            .await
            .map_err(|e| e.to_string())
    }

    pub fn available_devices() -> Vec<String> {
        query(ApiBackend::Auto)
            .unwrap_or_default()
            .into_iter()
            .map(|info| format!("{}: {}", info.index(), info.human_name()))
            .collect()
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn parse_device_index(device: &str) -> Result<CameraIndex, String> {
    let raw = device.split(':').next().unwrap_or(device).trim();

    #[cfg(target_os = "linux")]
    if raw.starts_with("/dev/video") {
        let idx: u32 = raw
            .trim_start_matches("/dev/video")
            .parse()
            .map_err(|_| format!("Invalid device path: {device}"))?;
        return Ok(CameraIndex::Index(idx));
    }

    if let Ok(n) = raw.parse::<u32>() {
        return Ok(CameraIndex::Index(n));
    }

    Err(format!("Could not parse device identifier: '{device}'"))
}

// ── Tauri commands ────────────────────────────────────────────────────────────
