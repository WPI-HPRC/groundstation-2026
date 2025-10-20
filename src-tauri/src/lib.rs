use tokio::{time::{interval, Duration}};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};
use tauri::async_runtime::{JoinHandle};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};

mod serde_bool_0_1;

mod pb {
    pub mod hprc {
        include!("pb/hprc.rs");
    }
}

use pb::hprc::RocketTelemetryPacket;

struct CsvState {
    handle: Arc<Mutex<Option<JoinHandle<()>>>>,
}

// Shared state managed by Tauri
struct SimState {
    is_running: Arc<AtomicBool>,
}

#[tauri::command]
fn start_data_sim(app_handle: AppHandle, csv_state: tauri::State<CsvState>, sim_state: tauri::State<SimState>, path: String, ) -> Result<String, String> {

    println!("Starting data sim");

    if let Some(h) = csv_state.handle.lock().take() {
        h.abort();
    }

    sim_state.is_running.store(true, Ordering::SeqCst);

    let app = app_handle.clone();
    let is_running = sim_state.is_running.clone();

    let delay_ms: u64 = 125;

    println!("Spawning task");
    // Spawn a fresh stream task
    let handle = tauri::async_runtime::spawn(async move {
        if let Err(e) = data_sim_loop(app, is_running,  path, delay_ms).await {
            eprintln!("CSV stream error: {e}");
        }
    });

    *csv_state.handle.lock() = Some(handle);
    Ok("CSV stream started".into())
}

#[tauri::command]
fn stop_data_sim(state: tauri::State<SimState>) -> String {
    state.is_running.store(false, Ordering::SeqCst);
    "Stopping Simulation".into()
}

async fn data_sim_loop(app: AppHandle, running: Arc<AtomicBool>, path: String, delay_ms: u64) -> Result<(), String>  {

    println!("Starting the sim");

    let (tx, mut rx) = tokio::sync::mpsc::channel::<RocketTelemetryPacket>(1024);

    let mut interval_ms = interval(Duration::from_millis(delay_ms));


    let reader_task = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut rdr = csv::ReaderBuilder::new()
            .has_headers(true)
            .flexible(true) // require all columns present; set true if your rows vary
            .from_path(&path)
            .map_err(|e| e.to_string())?;

        // 👇 Direct Serde into your prost struct (works because of #[derive(Deserialize)] + camelCase)
        for rec in rdr.deserialize::<RocketTelemetryPacket>() {
            let pkt = rec.map_err(|e| e.to_string())?;
            if tx.blocking_send(pkt).is_err() {
                break; // receiver closed
            }
        }
        Ok(())
    });

    while running.load(Ordering::SeqCst) {
        if let Some(packet) = rx.recv().await {
            app.emit("sim_data", &packet).map_err(|e| e.to_string())?;
            interval_ms.tick().await;
        }
        else {
            break;
        }
    }

    reader_task.await.map_err(|e| e.to_string())??;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())

        .manage(
            SimState {
                is_running: Arc::new(AtomicBool::new(false)),
            })
        .manage(
            CsvState {
                handle: Arc::new(Mutex::new(None)),
            })
        .invoke_handler(tauri::generate_handler![
            start_data_sim,
            stop_data_sim
            ])

        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
