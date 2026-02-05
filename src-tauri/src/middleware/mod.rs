// Main middleware module

use std::{path::PathBuf, sync::Arc};

use chrono::Local;

pub mod video_streams;
pub mod telemetry_stores;
pub mod video_encoder_manager;

use video_streams::
    {VideoFrame, VideoFrameForFrontend, VideoStreams};
use video_encoder_manager::EncoderManager;
use telemetry_stores::
    {TelemetryData, TelemetryStores};

#[derive(Clone)]
pub struct Middleware {
    pub telemetry: Arc<TelemetryStores>,
    pub video_streams: Arc<VideoStreams>,
    pub base_path: PathBuf,
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
        }
    }

    pub fn shutdown(&self) {
        self.telemetry.shutdown();
        self.video_streams.shutdown();
    }

// ------------------------------------------------  Recording  ------------------------------------------------ //


    pub fn start_recording_all(&self) -> Result<(), String> {
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


// ------------------------------------------------  Telemetry  ------------------------------------------------ //
    pub fn push_data(&self, store_name: &str, field: &str, data: TelemetryData) -> Result<(), String> {
        if !self.telemetry.has_store(store_name) {
            self.create_new_store(store_name)?;
        }

        self.telemetry.push(store_name, field, data)?;
        Ok(())
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
    pub fn process_video_frame(&self, name: &str, frame: VideoFrame) -> Result<(), String> {
        if !self.video_streams.has_stream(name) {
            self.video_streams.create_stream(name);
        }

        self.video_streams.push_frame(name, frame)
    }

    pub fn get_latest_video_frame(&self, name: &str) -> Option<VideoFrameForFrontend> {
        self.video_streams.latest_frame(name)
    }

    pub fn get_video_keys(&self) -> Vec<String> {
        self.video_streams.list_streams()
    }

    fn start_recording_video(
        &self, 
        name: &str,
        fps: i32,
    ) -> Result<(), String> {
        let latest_frame = self.get_latest_video_frame(name);
        if latest_frame.is_none() {
            return Err("No video input! Cannot start recording".into());
        }
        let latest_frame = Option::expect(latest_frame, "");
        self.video_streams.start_recording(name, self.create_video_path(name), latest_frame.width, latest_frame.height, fps)
    }

    fn stop_recording_video(
        &self,
        name: &str,
    ) -> Result<(), String> {
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