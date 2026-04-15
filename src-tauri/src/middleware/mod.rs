// Main middleware module

use std::{path::PathBuf, sync::Arc};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};

use chrono::Local;

pub mod video_streams;
pub mod telemetry_stores;
pub mod video_encoder_manager;

use video_streams::
    {VideoFrame, VideoStreams};
use video_encoder_manager::EncoderManager;
use telemetry_stores::
    {TelemetryData, TelemetryStores};

#[derive(Serialize, Deserialize)]
pub struct VideoFrameFrontend {
    pub timestamp: i64,
    pub data_base64: String,
    pub width: u32,
    pub height: u32,
}
#[derive(Serialize, Deserialize)]
pub struct TelemetryDataFrontend {
    pub timestamp: i64,
    pub value: String,
}

pub struct Middleware {
    telemetry: Arc<TelemetryStores>,
    video_streams: Arc<VideoStreams>,
    base_path: PathBuf,
    recording: AtomicBool,
}

impl Middleware {
    pub fn new(base_path: PathBuf) -> Self {
        Middleware { 
            telemetry: Arc::new(TelemetryStores::new()),
            video_streams: Arc::new(
                VideoStreams::new(
                    Arc::new(EncoderManager::new())
                )
            ),
            base_path,
            recording: AtomicBool::new(false),
        }
    }

    pub fn shutdown(&self) {
        self.telemetry.shutdown();
        self.video_streams.shutdown();
    }

// ------------------------------------------------  Recording  ------------------------------------------------ //


    pub fn start_recording_all(&self) -> Result<(), String> {
        self.recording.store(true, Ordering::Release);
        let store_names = self.get_store_names();
        for store_name in store_names {
            self.start_recording(&store_name)?;
        }
        let stream_names = self.get_video_keys();
        for key in stream_names {
            self.start_recording_video(&key, 60)?;
        }
        Ok(())
    }

    pub fn stop_recording_all(&self) -> Result<(), String> {
        self.recording.store(false, Ordering::Release);
        let store_names = self.get_store_names();
        for store_name in store_names {
            self.stop_recording(&store_name)?;
        }
        let stream_names = self.get_video_keys();
        for key in stream_names {
            self.stop_recording_video(&key)?;
        }
        Ok(())
    }

    pub fn get_recording_status(&self) -> bool {
        self.recording.load(Ordering::Acquire)
    }


// ------------------------------------------------  Telemetry  ------------------------------------------------ //
    pub fn push_data(&mut self, store_name: &str, field: &str, data: TelemetryData) -> Result<(), String> {
        if !self.telemetry.has_store(store_name) {
            self.create_new_store(store_name)?;
        }

        self.telemetry.push(store_name, field, data)
    }

    pub fn get_last(&self, store_name: &str, field: &str
    ) -> Result<Option<TelemetryData>, String> {
        self.telemetry.get_last(store_name, field)
    }

    pub fn get_last_n(&self, store_name: &str, field: &str, n: usize
    ) -> Result<Option<Vec<TelemetryData>>, String> {
        self.telemetry.get_last_n(store_name, field, n)
    }

    pub fn get_all(&self, store_name: &str, field: &str
    ) -> Result<Vec<TelemetryData>, String> {
        self.telemetry.get_all(store_name, field)
    }

    pub fn get_store_names(&self) -> Vec<String> {
        self.telemetry.list_stores()
    }

    fn start_recording(&self, store_name: &str) -> Result<(), String> {
        self.telemetry.start_recording(store_name)
    }

    fn stop_recording(&self, store_name: &str) -> Result<(), String> {
        self.telemetry.stop_recording(store_name)
    }

// ------------------------------------------------  VIDEO  ------------------------------------------------ //
    pub fn process_video_frame(&self, name: &str, frame: Arc<VideoFrame>) -> Result<(), String> {
        if !self.video_streams.has_stream(name) {
            self.video_streams.create_stream(name);
        }

        self.video_streams.push_frame(name, frame)
    }

    pub fn get_latest_video_frame(
    &self,
    name: &str,
) -> Option<VideoFrameFrontend> {
    let frame = self.video_streams.latest_frame(name)?;

    Some(VideoFrameFrontend {
        timestamp: frame.timestamp,
        data_base64: frame.to_frontend_base64(),
        width: frame.width,
        height: frame.height,
    })
}

    pub fn get_video_keys(&self) -> Vec<String> {
        self.video_streams.list_streams()
    }

    fn start_recording_video(&self, name: &str, fps: i32,) -> Result<(), String> {
        let frame = self
            .video_streams
            .latest_frame(name)
            .ok_or_else(|| "No video input! Cannot start recording".to_string())?;
        self.video_streams.start_recording(name, self.create_video_path(name), frame.width, frame.height, fps)
    }

    fn stop_recording_video(&self, name: &str) -> Result<(), String> {
        self.video_streams.stop_recording(name)
    }

// ------------------------------------------------  Utility  ------------------------------------------------ //

    fn create_new_store(&self, store_name: &str) -> Result<(), String> {
        let path = self.base_path
            .join(store_name)
            .join("_")
            .join(Local::now().to_rfc3339())
            .join(".csv");
        self.telemetry.create_new_store(store_name, path)
    }

    fn create_video_path(&self, name: &str) -> PathBuf {
        self.base_path
            .join(name)
            .join("_")
            .join(Local::now().to_rfc3339())
            .join(".avi")
    }


}