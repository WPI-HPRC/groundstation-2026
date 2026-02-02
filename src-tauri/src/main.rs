// Main Tauri Application

use tauri::{Manager, RunEvent, WebviewWindowBuilder, WindowEvent, utils::config_v1::WindowUrl};

use crate::middleware::Middleware;

// relavent imports
mod middleware;
mod commands;

// goofy shutdown thing
struct ShutdownState {
    shutdown_tx: tokio::sync::watch::Sender<()>,
}

fn setup_backend(app: &tauri::App) -> tauri::Result<()> {
    
    let app_handle = app.handle();
    let main_window = app.get_webview_window("main").unwrap();

    // init middleware
    let middleware = Middleware::new();
    
    // give it to tauri data store so things can access it
    app_handle.manage(middleware.clone());

    

    // create an app shutdown signal
    let(shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(());


    app_handle.manage(ShutdownState { shutdown_tx });
    // create our backends

    // let telem_radio_service = TelemetryRadioService::new(middleware.clone());
    // tauri::async_runtime::spawn(async move {
        // telem_radio_service.run(shutdown_rx.clone()).await;
    // });

    // let video_capture_service = VideoCaptureService::new(middleware.clone());
    // tauri::async_runtime::spawn(async move {
    //     video_capture_service.run(shutdown_rx.clone()).await;
    // });


    // create secondary windows
    let livestream_window = WebviewWindowBuilder::new(
        app,
        "Livestream-Display",
        tauri::WebviewUrl::App("/livestream".into()),
    )
    .title("Livestream")
    .inner_size(800.0, 600.0)
    .resizable(true)
    .build()?;

    

    Ok(())
}

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#[cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    #[cfg_attr(mobile, tauri::mobile_entry_point)]
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| Ok(setup_backend(app)?))

        .invoke_handler(tauri::generate_handler![
            commands::set_telemetry,
            commands::get_telemetry,
            commands::get_telemetry_keys,
            commands::get_latest_telemetry,
            commands::get_field_keys,
            commands::get_all_field_keys,
            commands::start_telemetry_recording,
            commands::stop_telemetry_recording,
            commands::start_video_recording,
            commands::stop_video_recording,
            commands::stop_all_video_recordings,
            commands::get_recording_status,
            commands::get_video_keys,
            commands::get_latest_video_frame,
            commands::clear_telemetry_key,
            commands::clear_all_telemetry,
            commands::add_video_frame,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::WindowEvent { 
            label, 
            event: WindowEvent::CloseRequested { api, .. },
            .. 
        } = event
        {
            if label == "main" {
                println!("Program closing, sending shutdown signal...");

                // send shutdown to background tasks
                let shutdown_tx = app_handle.state::<ShutdownState>().shutdown_tx.clone();
                
                
                let _ = shutdown_tx.send(());

                // call explicit cleanup on middleware
                // middleware.cleanup();
                
                api.prevent_close();

                app_handle.exit(0);
            }
        }
    });
}