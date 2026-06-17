use nokhwa::{
    pixel_format::RgbFormat,
    query,
    utils::{ApiBackend, CameraIndex, CameraFormat, FrameFormat, RequestedFormat, RequestedFormatType, Resolution},
    Camera,
};
use std::{
    sync::Arc,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::{mpsc, Mutex};
use tokio_util::sync::CancellationToken;

use crate::middleware::{Middleware, video_streams::{PreviewJpegFrame, VideoFrame}};

// ── Constants ─────────────────────────────────────────────────────────────────

const PREFERRED_WIDTH: u32 = 1920;
const PREFERRED_HEIGHT: u32 = 1080;
const PREFERRED_FPS: u32 = 60;
const FALLBACK_TARGET_WIDTH: u32 = 640;
const FALLBACK_TARGET_HEIGHT: u32 = 480;

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
                    eprintln!("[video] MJPEG also unavailable ({e}), selecting from supported formats");
                    open_best_supported_format(index)
                }
            }
        }
    }
}

fn open_best_supported_format(index: CameraIndex) -> Result<Camera, String> {
    let mut camera = Camera::new(
        index,
        RequestedFormat::new::<RgbFormat>(RequestedFormatType::None),
    )
    .map_err(|e| e.to_string())?;

    let mut formats = camera.compatible_camera_formats().map_err(|e| e.to_string())?;
    if formats.is_empty() {
        return Err("camera reported no supported formats".to_string());
    }

    formats.sort_by_key(score_camera_format);
    formats.reverse();

    eprintln!("[video] Supported camera formats, ranked:");
    for format in formats.iter().take(8) {
        eprintln!(
            "[video]   {}x{} @ {}fps {:?}",
            format.width(),
            format.height(),
            format.frame_rate(),
            format.format()
        );
    }

    let selected = formats[0];
    eprintln!(
        "[video] Selected fallback format {}x{} @ {}fps {:?}",
        selected.width(),
        selected.height(),
        selected.frame_rate(),
        selected.format()
    );

    let selected_formats = [selected.format()];
    Camera::new(
        camera.index().clone(),
        RequestedFormat::with_formats(
            RequestedFormatType::Exact(selected),
            &selected_formats,
        ),
    )
    .map_err(|e| e.to_string())
}

fn score_camera_format(format: &CameraFormat) -> (u32, u32, u32, u32) {
    let format_score = match format.format() {
        FrameFormat::MJPEG => 3,
        FrameFormat::YUYV => 2,
        _ => 1,
    };

    let area = format.width().saturating_mul(format.height());
    let target_area = FALLBACK_TARGET_WIDTH.saturating_mul(FALLBACK_TARGET_HEIGHT);
    let distance_from_target = area.abs_diff(target_area);
    let resolution_score = u32::MAX.saturating_sub(distance_from_target);

    (
        format.frame_rate(),
        format_score,
        resolution_score,
        area,
    )
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
            let (preview_tx, mut preview_rx) = mpsc::channel::<Arc<PreviewJpegFrame>>(8);

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

                let mut fps_window_start = Instant::now();
                let mut fps_window_frames = 0u32;

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

                    let timestamp = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as i64;

                    if buffer.source_frame_format() == FrameFormat::MJPEG {
                        let preview_frame = Arc::new(PreviewJpegFrame {
                            timestamp,
                            data: buffer.buffer().to_vec(),
                        });
                        let _ = preview_tx.try_send(preview_frame);
                    }

                    fps_window_frames += 1;
                    let fps_elapsed = fps_window_start.elapsed();
                    if fps_elapsed >= Duration::from_secs(3) {
                        let measured_fps =
                            fps_window_frames as f64 / fps_elapsed.as_secs_f64();
                        eprintln!(
                            "[video] Capturing {device_clone} at {:.1}fps measured (reported {}fps)",
                            measured_fps,
                            camera.frame_rate()
                        );
                        fps_window_start = Instant::now();
                        fps_window_frames = 0;
                    }

                    let decoded = match buffer.decode_image::<RgbFormat>() {
                        Ok(img) => img,
                        Err(e) => {
                            eprintln!("[video] Decode error on {device_clone}: {e}");
                            continue;
                        }
                    };

                    let resolution = camera.resolution();
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
                    loop {
                        tokio::select! {
                            frame = frame_rx.recv() => match frame {
                                Some(frame) => {
                                    if let Err(e) = middleware.lock().await.process_video_frame(&stream_name, frame) {
                                        eprintln!("[video] process_video_frame error: {e}");
                                    }
                                }
                                None => break,
                            },
                            preview_frame = preview_rx.recv() => match preview_frame {
                                Some(preview_frame) => {
                                    if let Err(e) = middleware.lock().await.process_preview_jpeg(&stream_name, preview_frame) {
                                        eprintln!("[video] process_preview_jpeg error: {e}");
                                    }
                                }
                                None => break,
                            },
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
