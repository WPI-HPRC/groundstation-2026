use crate::{
    backend::telemetry_radio_interface::{TelemetryRadioHandle, hprc}, 
    channels::{LiveVideoHandle, TrackingCameraHandle}, 
    middleware::{Middleware, TelemetryDataFrontend, VideoFrameFrontend},
    backend::video_capture_interface::CameraHandle,
};
use tauri::State;
// use std::alloc::Global;
// use serde::Serialize;
// use std::collections::HashMap;
// use crate::Channels;

/* =========================================================
   PLAYBACK CONTROL
   ========================================================= */

// #[tauri::command]
// pub async fn set_playback_state(
//     playback_channel: State<'_, Channels::PlaybackControlChannel>,
//     control: Channels::PlaybackState,
// ) -> Result<(), String> {
//     playback_channel
//         .playback_tx
//         .send(control)
//         .map_err(|_| "Data Playback Backend not running".to_string())
// }

// #[tauri::command]
// pub async fn get_playback_state(
//     playback_channel: State<'_, Channels::PlaybackControlChannel>,
// ) -> Result<Channels::PlaybackState, String> {
//     Ok(playback_channel.playback_rx.borrow().clone())
// }

/* =========================================================
   SERIAL/VIDEO PORT CHOOSING (WRITE + READ)
   ========================================================= */

#[tauri::command]
pub async fn get_serial_port_names(
) -> Result<Vec<String>, String> {
    Ok(TelemetryRadioHandle::available_ports())
}

#[tauri::command]
pub async fn set_telem_serial_port(
    telem_backend: State<'_, TelemetryRadioHandle>,
    port_name: String,
) -> Result<(), String> {
    telem_backend.send_serial_port(port_name).await
}

#[tauri::command]
pub async fn send_command(
    telem_backend: State<'_, TelemetryRadioHandle>,
    cmd: u8,
) -> Result<(), String> {
    let cmd = hprc::Command(cmd);
    telem_backend.send_command(cmd).await
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
   VIDEO
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

#[tauri::command]
pub fn list_video_devices() -> Vec<String> {
    CameraHandle::available_devices()
}

#[tauri::command]
pub async fn set_front_camera_device(
    camera_handle: tauri::State<'_, LiveVideoHandle>,
    device: String,
) -> Result<(), String> {
    camera_handle.0.set_device(device).await
}

#[tauri::command]
pub async fn set_payload_camera_device(
    camera_handle: tauri::State<'_, TrackingCameraHandle>,
    device: String,
) -> Result<(), String> {
    camera_handle.0.set_device(device).await
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