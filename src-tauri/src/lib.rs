// Main Tauri Application

use tauri::{Manager, RunEvent, WebviewWindowBuilder, WindowEvent};
use tokio::sync::{Mutex, mpsc};
use tokio_util::sync::CancellationToken;
use std::sync::{Arc};
use std::fs;

use std::path::{PathBuf as PathBuf};
// use tauri::path::PathResolver as PathResolver;
use chrono::Local;

// import our middleware
mod middleware;
use crate::backend::telemetry_radio_interface::hprc::Command;
use crate::middleware::Middleware;

// our channels for misc IPC
mod channels; 
use crate::channels::{self as Channels, PlaybackState}; 

mod commands;

mod backend;
use crate::backend::{ 
    // data_playback, 
    telemetry_radio_interface,
    // tracker_interface,
    // video_capture_interface,
};

// commands for tauri to call from frontend
// mod commands;

fn create_data_dir(app: &tauri::App) -> PathBuf {
    let docs_path = app.path().document_dir().unwrap_or(".".into());
    let base_path = docs_path
    .join("Ground-Station".to_string())
    .join(Local::now().format("%Y-%m-%d_%H-%M-%S").to_string());
    
    let _ = fs::create_dir_all(&base_path).map_err(|e| format!("Failed to create directory: {e}"));

    base_path
}

fn setup_backend(app: &tauri::App) -> tauri::Result<()> {
    
    let app_handle = app.handle();
    let main_window = app.get_webview_window("main").unwrap();

    // init middleware
    let middleware = Arc::new(Mutex::new(Middleware::new(create_data_dir(app))));

    // give it to tauri data store so things can access it
    app_handle.manage(middleware.clone());

    // create an app shutdown signal
    let shutdown = CancellationToken::new();
    let shutdown_rx = shutdown.child_token();
    
    // create a channel for communication to control data playback
    let(playback_tx, playback_rx) = tokio::sync::watch::channel::<PlaybackState>(PlaybackState::NoData);

    // create a channel to communicate hardware ports
    let(telemetry_radio_port_tx, telemetry_radio_port_rx) = tokio::sync::mpsc::channel::<String>(8);
    let(live_video_port_tx, live_video_port_rx) = mpsc::channel::<String>(8);
    let(tracking_video_port_tx, tracking_video_port_rx) = tokio::sync::mpsc::channel::<String>(8);
    let(tracker_port_tx, tracker_port_rx) = tokio::sync::mpsc::channel::<String>(8);
    let(pointing_stick_port_tx, pointing_stick_port_rx) = tokio::sync::mpsc::channel::<String>(8);

    let(remote_control_tx, remote_control_rx) = tokio::sync::mpsc::channel::<Command>(8);
    let(payload_control_tx, payload_control_rx) = tokio::sync::mpsc::channel::<(f32, f32)>(8);


    // give all our comms channels to tauri so we can access them in the frontend commands
    app_handle.manage(Channels::ShutdownState { shutdown });
    app_handle.manage(Channels::PlaybackControlChannel { playback_tx, playback_rx });
    app_handle.manage(Channels::HardwarePorts { telemetry_radio_port_tx, live_video_port_tx, tracking_video_port_tx, tracker_port_tx, pointing_stick_port_tx });
    app_handle.manage(Channels::RemoteControlChannels {remote_control_tx, payload_control_tx});


    // create our backend modules

    // let data_playback = data_playback::new(middleware.clone(), playback_rx.clone());
    // tauri::async_runtime::spawn(async move {
        // data_playback.run(shutdown_rx.clone()).await;
    // });

    let telem_shutdown_rx = shutdown_rx.clone();
    let (telem_radio, telem_radio_handle) 
        = telemetry_radio_interface::new(middleware.clone());
    tauri::async_runtime::spawn(async move {
        telem_radio.run(telem_shutdown_rx).await;
    });
    app_handle.manage(telem_radio_handle);

    // let telem_shutdown_rx2 = shutdown_rx.clone();
    // let (telem_radio2, telem_radio_handle2) 
    //     = telemetry_radio_interface::new(middleware.clone());
    // tauri::async_runtime::spawn(async move {
    //     telem_radio2.run(telem_shutdown_rx2).await;
    // });


    // let video_capture_onboard = video_capture_interface::new(middleware.clone());
    // tauri::async_runtime::spawn(async move {
    //     video_capture_onboard.run(shutdown_rx.clone()).await;
    // });

    // let video_capture_ground = video_capture_interface::new(middleware.clone());
    // tauri::async_runtime::spawn(async move {
    //     video_capture_ground.run(shutdown_rx.clone()).await;
    // });

    // let tracker_interface = tracker_interface::new(middleware.clone());
    // tauri::async_runtime::spawn(async move {
    //     tracker_interface.run(shutdown_rx.clone()).await;
    // });



    // create secondary windows
    // let livestream_window = WebviewWindowBuilder::new(
    //     app,
    //     "Livestream-Display",
    //     tauri::WebviewUrl::App("/livestream".into()),
    // )
    // .title("Livestream")
    // .inner_size(800.0, 600.0)
    // .resizable(true)
    // .build()?;

    

    Ok(())
}

pub fn run() {
    #[cfg_attr(mobile, tauri::mobile_entry_point)]
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| Ok(setup_backend(app)?))

        .invoke_handler(tauri::generate_handler![
            // Playback control
            // commands::set_playback_state,
            // commands::get_playback_state,

            // Telemetry (read-only)
            commands::get_telemetry,
            commands::get_latest_telemetry,
            commands::get_telemetry_store_names,

            // Video (read-only)
            commands::get_video_stream_names,
            commands::get_latest_video_frame,
    

            // Global recording control
            commands::get_recording_status,
            commands::start_recording_all,
            commands::stop_recording_all,
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
                app_handle.state::<Channels::ShutdownState>().shutdown.cancel();

                // call explicit cleanup on middleware to close file handles
                let middleware = app_handle.state::<Arc<Middleware>>();
                middleware.shutdown();
                
                api.prevent_close();

                app_handle.exit(0);
            }
        }
    });
}