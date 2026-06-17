use crate::{
    backend::telemetry_radio_interface::{TelemetryRadioHandle, hprc}, 
    channels::{LiveVideoHandle, TrackingCameraHandle}, 
    middleware::{
        telemetry_stores::TelemetryData, Middleware, TelemetryDataFrontend, VideoFrameFrontend,
        VideoFrameJpegFrontend,
    },
    backend::video_capture_interface::CameraHandle,
};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex as StdMutex, OnceLock},
};
use tauri::State;
use tokio::sync::Mutex;
// use std::alloc::Global;
// use serde::Serialize;
// use std::collections::HashMap;
// use crate::Channels;

const DASHBOARD_FIELDS: &[&str] = &[
    "state",
    "battery_voltage",
    "temp",
    "pressure",
    "asm330_gyr0",
    "asm330_gyr1",
    "asm330_gyr2",
    "asm330_accel0",
    "asm330_accel1",
    "asm330_accel2",
    "mag0",
    "mag1",
    "mag2",
    "w",
    "i",
    "j",
    "k",
    "vel_x",
    "vel_y",
    "vel_z",
    "pos_x",
    "pos_y",
    "pos_z",
];

fn telemetry_debug_enabled() -> bool {
    std::env::var("HPRC_TELEM_DEBUG").as_deref() == Ok("1")
}

fn telemetry_debug_seen() -> &'static StdMutex<HashSet<String>> {
    static SEEN: OnceLock<StdMutex<HashSet<String>>> = OnceLock::new();
    SEEN.get_or_init(|| StdMutex::new(HashSet::new()))
}

fn log_dashboard_read(store_name: &str, field_name: &str, data: &Option<crate::middleware::telemetry_stores::TelemetryData>) {
    if !telemetry_debug_enabled() || store_name != "rocket" || !DASHBOARD_FIELDS.contains(&field_name) {
        return;
    }

    let status = if data.is_some() { "hit" } else { "missing" };
    let key = format!("{store_name}.{field_name}.{status}");
    let Ok(mut seen) = telemetry_debug_seen().lock() else {
        return;
    };
    if !seen.insert(key) {
        return;
    }

    match data {
        Some(d) => println!(
            "[telemetry_debug] get_latest {store_name}.{field_name} -> hit timestamp={} value={}",
            d.timestamp,
            d.value
        ),
        None => println!("[telemetry_debug] get_latest {store_name}.{field_name} -> missing"),
    }
}

fn log_dashboard_read_error(store_name: &str, field_name: &str, error: &str) {
    if !telemetry_debug_enabled() || store_name != "rocket" || !DASHBOARD_FIELDS.contains(&field_name) {
        return;
    }

    let key = format!("{store_name}.{field_name}.error.{error}");
    let Ok(mut seen) = telemetry_debug_seen().lock() else {
        return;
    };
    if !seen.insert(key) {
        return;
    }

    println!("[telemetry_debug] get_latest {store_name}.{field_name} -> error: {error}");
}

fn log_telemetry_snapshot(middleware: &Middleware, reason: &str) {
    if !telemetry_debug_enabled() {
        return;
    }

    let key = format!("snapshot.{reason}");
    let Ok(mut seen) = telemetry_debug_seen().lock() else {
        return;
    };
    if !seen.insert(key) {
        return;
    }
    drop(seen);

    let stores = middleware.get_store_names();
    println!("[telemetry_debug] snapshot after {reason}: stores={stores:?}");
    for store in stores {
        match middleware.get_field_names(&store) {
            Ok(mut fields) => {
                fields.sort();
                println!("[telemetry_debug] snapshot store {store}: fields={fields:?}");
            }
            Err(error) => println!("[telemetry_debug] snapshot store {store}: error={error}"),
        }
    }
}

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
    println!("[command] set_telem_serial_port({port_name})");
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
    middleware: State<'_, Arc<Mutex<Middleware>>>,
    store_name: String,
    field_name: String,
    count: Option<usize>,
) -> Result<Vec<TelemetryDataFrontend>, String> {
    let middleware = middleware.lock().await;
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
    middleware: State<'_, Arc<Mutex<Middleware>>>,
    store_name: String,
    field_name: String,
) -> Result<Option<TelemetryDataFrontend>, String> {
    let middleware = middleware.lock().await;
    let data = match middleware.get_last(&store_name, &field_name) {
        Ok(data) => data,
        Err(error) => {
            log_dashboard_read_error(&store_name, &field_name, &error);
            log_telemetry_snapshot(&middleware, "dashboard-read-error");
            return Err(error);
        }
    };
    log_dashboard_read(&store_name, &field_name, &data);
    if data.is_none() && store_name == "rocket" && DASHBOARD_FIELDS.contains(&field_name.as_str()) {
        log_telemetry_snapshot(&middleware, "dashboard-missing-field");
    }

    Ok(data.map(|d| TelemetryDataFrontend {
        timestamp: d.timestamp,
        value: d.value.to_string(),
    }))
}

#[tauri::command]
pub async fn get_telemetry_store_names(
    middleware: State<'_, Arc<Mutex<Middleware>>>,
) -> Result<Vec<String>, String> {
    let middleware = middleware.lock().await;
    Ok(middleware.get_store_names())
}

#[tauri::command]
pub async fn spoof_rocket_telemetry_once(
    middleware: State<'_, Arc<Mutex<Middleware>>>,
) -> Result<(), String> {
    let timestamp = chrono::Utc::now().timestamp_millis();
    let mut middleware = middleware.lock().await;

    push_spoof_data(&mut middleware, timestamp, "state", 2_u32)?;
    push_spoof_data(&mut middleware, timestamp, "battery_voltage", 12.4_f64)?;
    push_spoof_data(&mut middleware, timestamp, "temp", 24.5_f64)?;
    push_spoof_data(&mut middleware, timestamp, "pressure", 913.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "asm330_gyr0", 1.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "asm330_gyr1", 2.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "asm330_gyr2", 3.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "asm330_accel0", 0.1_f64)?;
    push_spoof_data(&mut middleware, timestamp, "asm330_accel1", 0.2_f64)?;
    push_spoof_data(&mut middleware, timestamp, "asm330_accel2", 9.8_f64)?;
    push_spoof_data(&mut middleware, timestamp, "mag0", 10.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "mag1", 20.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "mag2", 30.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "w", 1.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "i", 0.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "j", 0.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "k", 0.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "vel_x", 0.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "vel_y", 0.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "vel_z", 0.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "pos_x", 1.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "pos_y", 2.0_f64)?;
    push_spoof_data(&mut middleware, timestamp, "pos_z", 500.0_f64)?;

    println!("[telemetry_debug] spoofed one rocket telemetry frame at timestamp={timestamp}");
    Ok(())
}

fn push_spoof_data<T: Into<crate::middleware::telemetry_stores::TelemetryValue>>(
    middleware: &mut Middleware,
    timestamp: i64,
    field: &str,
    value: T,
) -> Result<(), String> {
    middleware.push_data(
        "rocket",
        field,
        TelemetryData::new().with_timestamp(timestamp).with_value(value),
    )
}

/* =========================================================
   VIDEO
   ========================================================= */

#[tauri::command]
pub async fn get_video_stream_names(
    middleware: State<'_, Arc<Mutex<Middleware>>>,
) -> Result<Vec<String>, String> {
    let middleware = middleware.lock().await;
    Ok(middleware.get_video_keys())
}

#[tauri::command]
pub async fn get_latest_video_frame(
    middleware: State<'_, Arc<Mutex<Middleware>>>,
    stream_name: String,
) -> Result<Option<VideoFrameFrontend>, String> {
    let middleware = middleware.lock().await;
    Ok(middleware.get_latest_video_frame(&stream_name))
}

#[tauri::command]
pub async fn get_latest_video_frame_jpeg(
    middleware: State<'_, Arc<Mutex<Middleware>>>,
    stream_name: String,
) -> Result<Option<VideoFrameJpegFrontend>, String> {
    let middleware = middleware.lock().await;
    middleware.get_latest_video_frame_jpeg(&stream_name)
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
    middleware: State<'_, Arc<Mutex<Middleware>>>,
) -> Result<(), String> {
    let middleware = middleware.lock().await;
    middleware.start_recording_all()
}

#[tauri::command]
pub async fn stop_recording_all(
    middleware: State<'_, Arc<Mutex<Middleware>>>,
) -> Result<(), String> {
    let middleware = middleware.lock().await;
    middleware.stop_recording_all()
}

#[tauri::command]
pub async fn get_recording_status(
    middleware: State<'_, Arc<Mutex<Middleware>>>,
) -> Result<bool, String> {
    let middleware = middleware.lock().await;
    Ok(middleware.get_recording_status())
}