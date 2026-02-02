// Main middleware module

pub mod telemetry_store;
pub mod video_stream;

use telemetry_store::{TelemetryStore, TelemetryData};
use video_stream::{VideoStream, VideoFrame, VideoFrameForFrontend};
use std::path::PathBuf;
use std::sync::Arc;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct Middleware {
    pub telemetry: Arc<TelemetryStore>,
    pub video: Arc<VideoStream>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecordingStatus {
    pub telemetry_recording: bool,
    pub telemetry_path: Option<String>,
    pub video_recording_keys: Vec<String>,
    pub video_paths: HashMap<String, String>,
    pub telemetry_keys: Vec<String>,
    pub telemetry_counts: HashMap<String, usize>,
    pub video_keys: Vec<String>,
    pub video_frame_counts: HashMap<String, u64>,
}

impl Middleware {
    pub fn new() -> Self {
        Middleware {
            telemetry: Arc::new(TelemetryStore::new()),
            video: Arc::new(VideoStream::new()),
        }
    }

    /// Set telemetry data for a specific key
    pub fn set_telemetry(&self, key: String, data: TelemetryData) -> Result<(), String> {
        self.telemetry.set_telemetry(key, data)
    }

    /// Get telemetry data for a specific key with optional count limit
    pub fn get_telemetry(&self, key: &str, count: Option<usize>) -> Vec<TelemetryData> {
        self.telemetry.get_telemetry(key, count)
    }

    /// Get all available telemetry keys
    pub fn get_telemetry_keys(&self) -> Vec<String> {
        self.telemetry.get_all_keys()
    }

    /// Get the latest telemetry data for a specific key
    pub fn get_latest_telemetry(&self, key: &str) -> Option<TelemetryData> {
        self.telemetry.get_latest(key)
    }

    /// Start unified recording - all telemetry goes to one CSV
    pub fn start_telemetry_recording(&self, file_path: PathBuf) -> Result<(), String> {
        self.telemetry.start_recording(file_path)
    }

    /// Stop unified telemetry recording
    pub fn stop_telemetry_recording(&self) -> Result<PathBuf, String> {
        self.telemetry.stop_recording()
    }

    /// Check if unified telemetry recording is active
    pub fn is_telemetry_recording(&self) -> bool {
        self.telemetry.is_recording()
    }

    /// Get unified CSV path
    pub fn get_telemetry_csv_path(&self) -> Option<PathBuf> {
        self.telemetry.get_csv_path()
    }

    /// Start recording video for a specific stream key
    pub fn start_video_recording(&self, key: String, file_path: PathBuf) -> Result<(), String> {
        self.video.start_recording(key, file_path)
    }

    /// Stop recording video for a specific stream key
    pub fn stop_video_recording(&self, key: &str) -> Result<(PathBuf, u64), String> {
        self.video.stop_recording(key)
    }

    /// Stop all video recordings
    pub fn stop_all_video_recordings(&self) -> Result<HashMap<String, (PathBuf, u64)>, String> {
        self.video.stop_all_recordings()
    }

    /// Process incoming video frame for a specific stream
    pub fn process_video_frame(&self, key: String, frame: VideoFrame) -> Result<(), String> {
        self.video.process_frame(key, frame)
    }

    /// Get all available video stream keys
    pub fn get_video_keys(&self) -> Vec<String> {
        self.video.get_all_keys()
    }

    /// Get latest video frame for a specific stream
    pub fn get_latest_video_frame(&self, key: &str) -> Option<VideoFrameForFrontend> {
        self.video.get_latest_frame_base64(key)
    }

    /// Get current recording status
    pub fn get_recording_status(&self) -> RecordingStatus {
        let mut telemetry_counts = HashMap::new();
        for key in self.telemetry.get_all_keys() {
            telemetry_counts.insert(key.clone(), self.telemetry.get_count(&key));
        }

        let video_recording_keys = self.video.get_recording_keys();
        let mut video_paths = HashMap::new();
        for key in &video_recording_keys {
            if let Some(path) = self.video.get_video_path(key) {
                video_paths.insert(key.clone(), path.to_string_lossy().to_string());
            }
        }

        let mut video_frame_counts = HashMap::new();
        for key in self.video.get_all_keys() {
            video_frame_counts.insert(key.clone(), self.video.get_frame_count(&key));
        }

        RecordingStatus {
            telemetry_recording: self.telemetry.is_recording(),
            telemetry_path: self.telemetry.get_csv_path()
                .map(|p| p.to_string_lossy().to_string()),
            video_recording_keys,
            video_paths,
            telemetry_keys: self.telemetry.get_all_keys(),
            telemetry_counts,
            video_keys: self.video.get_all_keys(),
            video_frame_counts,
        }
    }

    /// Clear all data for a specific telemetry key
    pub fn clear_telemetry_key(&self, key: &str) {
        self.telemetry.clear_key(key);
    }

    /// Clear all telemetry data
    pub fn clear_all_telemetry(&self) {
        self.telemetry.clear_all();
    }

    /// Get field keys for a specific telemetry stream
    pub fn get_field_keys(&self, key: &str) -> Vec<String> {
        self.telemetry.get_field_keys(key)
    }

    /// Get all unique field keys across all telemetry streams
    pub fn get_all_field_keys(&self) -> Vec<String> {
        self.telemetry.get_all_field_keys()
    }
    
    // closes our file handles
    pub fn cleanup(&self) {
        let _telem_status = self.telemetry.stop_recording();
        let _video_status = self.video.stop_all_recordings();
    }
}

impl Default for Middleware {
    fn default() -> Self {
        Self::new()
    }
}
