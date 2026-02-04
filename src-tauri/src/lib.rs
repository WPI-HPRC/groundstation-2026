// Main Tauri Application

use tauri::{Manager, RunEvent, WebviewWindowBuilder, WindowEvent};

// import our middleware
mod middleware;
use crate::middleware::Middleware;

// our channels for misc IPC
mod channels; 
use crate::channels::{self as Channels, PlaybackState}; 

mod backend;
use crate::backend::{self as DataPlayback, 
    data_playback, 
    direction_finding_interface,
    telemetry_radio_interface,
    tracker_interface,
    video_capture_interface,
};
    
// commands for tauri to call from frontend
mod commands; 


fn setup_backend(app: &tauri::App) -> tauri::Result<()> {
    
    let app_handle = app.handle();
    let main_window = app.get_webview_window("main").unwrap();

    // init middleware
    // let middleware = Middleware::new();
    
    // give it to tauri data store so things can access it
    // app_handle.manage(middleware.clone());

    // create an app shutdown signal
    let(shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(());
    
    // create a channel for communication to control data playback
    let(playback_tx, playback_rx) = tokio::sync::watch::channel::<PlaybackState>(PlaybackState::NoData);

    // create a channel to communicate hardware ports
    let(telemetry_radio_port_tx, telemetry_radio_port_rx) = tokio::sync::watch::channel(());
    let(live_video_port_tx, live_video_port_rx) = tokio::sync::watch::channel(());
    let(tracking_video_port_tx, tracking_video_port_rx) = tokio::sync::watch::channel(());
    let(tracker_port_tx, tracker_port_rx) = tokio::sync::watch::channel(());
    let(direction_finding_port_tx, direction_finding_port_rx) = tokio::sync::watch::channel(());

    // give all our comms channels to tauri so we can access them in the frontend commands
    app_handle.manage(Channels::ShutdownState { shutdown_tx });
    app_handle.manage(Channels::PlaybackControlChannel { playback_tx, playback_rx });
    app_handle.manage(Channels::HardwarePorts { telemetry_radio_port_tx, live_video_port_tx, tracking_video_port_tx, tracker_port_tx, direction_finding_port_tx });



    // create our backend modules

    // let data_playback = data_playback::new(middleware.clone(), playback_rx.clone());
    // tauri::async_runtime::spawn(async move {
        // data_playback.run(shutdown_rx.clone()).await;
    // });

    // let telem_radio = telemetry_radio_interface::new(middleware.clone());
    // tauri::async_runtime::spawn(async move {
        // telem_radio.run(shutdown_rx.clone()).await;
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

    // let direction_finding_interface = direction_finding_interface::new(middleware.clone());
    // tauri::async_runtime::spawn(async move {
    //     direction_finding_interface.run(shutdown_rx.clone()).await;
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
            commands::set_playback_state,
            commands::get_playback_state,
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
                let shutdown_tx = app_handle.state::<Channels::ShutdownState>().shutdown_tx.clone();
                
                // we don't care about the result, so just map it to _ (drop it)
                let _ = shutdown_tx.send(());

                // call explicit cleanup on middleware
                // middleware.cleanup();
                
                api.prevent_close();

                app_handle.exit(0);
            }
        }
    });
}