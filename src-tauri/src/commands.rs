use crate::middleware::{
    self, Middleware, TelemetryDataFrontend, VideoFrameFrontend
};
use tauri::State;
use serde::Serialize;
use std::collections::HashMap;
use crate::Channels;

/* =========================================================
   PLAYBACK CONTROL
   ========================================================= */

#[tauri::command]
pub async fn set_playback_state(
    playback_channel: State<'_, Channels::PlaybackControlChannel>,
    control: Channels::PlaybackState,
) -> Result<(), String> {
    playback_channel
        .playback_tx
        .send(control)
        .map_err(|_| "Data Playback Backend not running".to_string())
}

#[tauri::command]
pub async fn get_playback_state(
    playback_channel: State<'_, Channels::PlaybackControlChannel>,
) -> Result<Channels::PlaybackState, String> {
    Ok(playback_channel.playback_rx.borrow().clone())
}

/* =========================================================
   TELEMETRY (READ ONLY + DTO)
   ========================================================= */

#[tauri::command]
pub async fn get_telemetry(
    middleware: State<'_, Middleware>,
    store_name: String,
    field_name: String,
    count: Option<usize>,
) -> Result<Vec<TelemetryDataFrontend>, String> {
    let data = match count {
        Some(n) => middleware.get_last_n(&store_name, &field_name, n)?
            .unwrap_or_default(),
        None => middleware.get_all(&store_name, &field_name)?,
    };

    Ok(data
        .into_iter()
        .map(|d| TelemetryDataFrontend {
            timestamp: d.timestamp,
            value: d.value.to_string(),
        })
        .collect())
}

#[tauri::command]
pub async fn get_latest_telemetry(
    middleware: State<'_, Middleware>,
    store_name: String,
    field_name: String,
) -> Result<Option<TelemetryDataFrontend>, String> {
    let data = middleware.get_last(&store_name, &field_name)?;

    Ok(data.map(|d| TelemetryDataFrontend {
        timestamp: d.timestamp,
        value: d.value.to_string(),
    }))
}

#[tauri::command]
pub async fn get_telemetry_store_names(
    middleware: State<'_, Middleware>,
) -> Result<Vec<String>, String> {
    Ok(middleware.get_store_names())
}

/* =========================================================
   VIDEO (READ ONLY)
   ========================================================= */

#[tauri::command]
pub async fn get_video_stream_names(
    middleware: State<'_, Middleware>,
) -> Result<Vec<String>, String> {
    Ok(middleware.get_video_keys())
}

#[tauri::command]
pub async fn get_latest_video_frame(
    middleware: State<'_, Middleware>,
    stream_name: String,
) -> Result<Option<VideoFrameFrontend>, String> {
    Ok(middleware.get_latest_video_frame(&stream_name))
}

/* =========================================================
   GLOBAL RECORDING CONTROL
   ========================================================= */

#[tauri::command]
pub async fn start_recording_all(
    middleware: State<'_, Middleware>,
) -> Result<(), String> {
    middleware.start_recording_all()
}

#[tauri::command]
pub async fn stop_recording_all(
    middleware: State<'_, Middleware>,
) -> Result<(), String> {
    middleware.stop_recording_all()
}

#[tauri::command]
pub async fn get_recording_status(
    middleware: State<'_, Middleware>,
) -> Result<bool, String> {
    Ok(middleware.get_recording_status())
}