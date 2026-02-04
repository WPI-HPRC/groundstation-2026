// Tauri commands for frontend-backend communication

use crate::middleware::{Middleware, RecordingStatus};
use crate::middleware::telemetry_store::TelemetryData;
use crate::middleware::video_stream::{VideoFrame, VideoFrameForFrontend};
use tauri::State;
use std::path::PathBuf;
use std::collections::HashMap;
use crate::Channels;

// set data playback mode
#[tauri::command]
pub async fn set_playback_state(
    playback_channel: State<'_, Channels::PlaybackControlChannel>,
    control: Channels::PlaybackState,  
) -> Result<(), String> {
    playback_channel.playback_tx.send(control)
    .map_err(|_| "Data Playback Backend not running".to_string())
}

// get data playback mode
#[tauri::command]
pub async fn get_playback_state(
    playback_channel: State<'_, Channels::PlaybackControlChannel>,
) -> Result<Channels::PlaybackState, String> {
    Ok(playback_channel.playback_rx.borrow().clone())
}


/// Set telemetry data for a specific key
#[tauri::command]
pub async fn set_telemetry(
    middleware: State<'_, Middleware>,
    key: String,
    data: TelemetryData,
) -> Result<String, String> {
    middleware.set_telemetry(key.clone(), data)?;
    Ok(format!("Telemetry set for key: {}", key))
}

/// Get telemetry data for a specific key
/// If count is None, returns all data. Otherwise returns last N points.
#[tauri::command]
pub async fn get_telemetry(
    middleware: State<'_, Middleware>,
    key: String,
    count: Option<usize>,
) -> Result<Vec<TelemetryData>, String> {
    Ok(middleware.get_telemetry(&key, count))
}

/// Get all available telemetry keys
#[tauri::command]
pub async fn get_telemetry_keys(
    middleware: State<'_, Middleware>,
) -> Result<Vec<String>, String> {
    Ok(middleware.get_telemetry_keys())
}

/// Get the latest telemetry data for a specific key
#[tauri::command]
pub async fn get_latest_telemetry(
    middleware: State<'_, Middleware>,
    key: String,
) -> Result<Option<TelemetryData>, String> {
    Ok(middleware.get_latest_telemetry(&key))
}

/// Get field keys for a specific telemetry stream
#[tauri::command]
pub async fn get_field_keys(
    middleware: State<'_, Middleware>,
    key: String,
) -> Result<Vec<String>, String> {
    Ok(middleware.get_field_keys(&key))
}

/// Get all unique field keys across all telemetry streams
#[tauri::command]
pub async fn get_all_field_keys(
    middleware: State<'_, Middleware>,
) -> Result<Vec<String>, String> {
    Ok(middleware.get_all_field_keys())
}

/// Start unified telemetry recording - all streams to one CSV
#[tauri::command]
pub async fn start_telemetry_recording(
    middleware: State<'_, Middleware>,
    file_path: String,
) -> Result<String, String> {
    let path = PathBuf::from(file_path);
    middleware.start_telemetry_recording(path)?;
    Ok("Telemetry recording started".to_string())
}

/// Stop unified telemetry recording
#[tauri::command]
pub async fn stop_telemetry_recording(
    middleware: State<'_, Middleware>,
) -> Result<String, String> {
    let path = middleware.stop_telemetry_recording()?;
    Ok(path.to_string_lossy().to_string())
}

/// Start video recording for a specific stream
#[tauri::command]
pub async fn start_video_recording(
    middleware: State<'_, Middleware>,
    key: String,
    file_path: String,
) -> Result<String, String> {
    let path = PathBuf::from(file_path);
    middleware.start_video_recording(key.clone(), path)?;
    Ok(format!("Video recording started for stream: {}", key))
}

/// Stop video recording for a specific stream
#[tauri::command]
pub async fn stop_video_recording(
    middleware: State<'_, Middleware>,
    key: String,
) -> Result<(String, u64), String> {
    let (path, frame_count) = middleware.stop_video_recording(&key)?;
    Ok((path.to_string_lossy().to_string(), frame_count))
}

/// Stop all video recordings
#[tauri::command]
pub async fn stop_all_video_recordings(
    middleware: State<'_, Middleware>,
) -> Result<HashMap<String, (String, u64)>, String> {
    let results = middleware.stop_all_video_recordings()?;
    Ok(results.into_iter()
        .map(|(k, (path, count))| (k, (path.to_string_lossy().to_string(), count)))
        .collect())
}

/// Get current recording status
#[tauri::command]
pub async fn get_recording_status(
    middleware: State<'_, Middleware>,
) -> Result<RecordingStatus, String> {
    Ok(middleware.get_recording_status())
}

/// Get all video stream keys
#[tauri::command]
pub async fn get_video_keys(
    middleware: State<'_, Middleware>,
) -> Result<Vec<String>, String> {
    Ok(middleware.get_video_keys())
}

/// Get latest video frame for a specific stream
#[tauri::command]
pub async fn get_latest_video_frame(
    middleware: State<'_, Middleware>,
    key: String,
) -> Result<Option<VideoFrameForFrontend>, String> {
    Ok(middleware.get_latest_video_frame(&key))
}

/// Clear all data for a specific telemetry key
#[tauri::command]
pub async fn clear_telemetry_key(
    middleware: State<'_, Middleware>,
    key: String,
) -> Result<String, String> {
    middleware.clear_telemetry_key(&key);
    Ok(format!("Data cleared for key: {}", key))
}

/// Clear all telemetry data
#[tauri::command]
pub async fn clear_all_telemetry(
    middleware: State<'_, Middleware>,
) -> Result<String, String> {
    middleware.clear_all_telemetry();
    Ok("All telemetry data cleared".to_string())
}

/// Process video frame for a specific stream (for backend modules to inject frames)
#[tauri::command]
pub async fn add_video_frame(
    middleware: State<'_, Middleware>,
    key: String,
    frame: VideoFrame,
) -> Result<String, String> {
    middleware.process_video_frame(key.clone(), frame)?;
    Ok(format!("Video frame added to stream: {}", key))
}
