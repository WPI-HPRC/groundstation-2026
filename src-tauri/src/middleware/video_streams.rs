// Middleware module for video streaming, recording, and display

use std::fs::{File, OpenOptions};
use std::hash::Hash;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};
use crate::middleware::video_encoder_manager::{EncoderId, EncoderManager};


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFrame {
    pub timestamp: u64,
    pub data: Vec<u8>, // 8 bit color, stored R,G,B then same for next pixel
    pub width: u32,
    pub height: u32,
    pub format: String, // "jpeg", "h264", "raw", etc.
}

// used for base64 encoded blob that gets JSON-ified to pass to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFrameForFrontend {
    pub timestamp: u64,
    pub data_base64: String, // base64 encoded 8 bit vector
    pub width: u32,
    pub height: u32,
    pub format: String,
}

// provide builtin function on the frame to convert to base-64 encoded version for frontend
impl VideoFrame {
    /// Convert to base64 for frontend consumption
    pub fn to_frontend(&self) -> VideoFrameForFrontend {
        VideoFrameForFrontend {
            timestamp: self.timestamp,
            data_base64: general_purpose::STANDARD.encode(&self.data),
            width: self.width,
            height: self.height,
            format: self.format.clone(),
        }
    }
}

/// store a specific video stream
struct VideoStream {
    recording: bool,
    video_file: Option<File>,
    video_path: Option<PathBuf>,
    frame_count: u64,
    latest_frame: Option<VideoFrame>,
    encoder_id: Option<EncoderId>,
}

// create constructor function
impl VideoStream {
    pub fn new() -> Self {
        VideoStream {
            recording: false,
            video_file: None,
            video_path: None,
            frame_count: 0,
            latest_frame: None,
            encoder_id: None,
        }
    }

    pub fn start_recording(
        &mut self,
        path: PathBuf,
        width: u32,
        height: u32,
        fps: i32,
        encoder_pool: &EncoderManager,
    ) -> Result<(), String> {
        if self.recording {
            return Err("Already recording".into());
        }

        // Create a new encoder for this stream
        let encoder_id = encoder_pool.create_encoder();
        encoder_pool
            .start(encoder_id, path.to_string_lossy().to_string(), width, height, fps)?;

        self.recording = true;
        self.video_path = Some(path);
        self.encoder_id = Some(encoder_id);
        self.frame_count = 0;

        Ok(())
    }

    /// Stop recording
    pub fn stop_recording(&mut self, encoder_pool: &EncoderManager) -> Result<(), String> {
        if let Some(encoder_id) = self.encoder_id.take() {
            encoder_pool.stop(encoder_id)?;
            encoder_pool.remove_encoder(encoder_id)?;
        }
        self.recording = false;
        Ok(())
    }

    /// Push a frame to this stream (latest frame + encoder if recording)
    pub fn push_frame(
        &mut self,
        frame: VideoFrame,
        encoder_pool: &EncoderManager,
    ) -> Result<(), String> {
        self.latest_frame = Some(frame.clone());
        self.frame_count += 1;

        if self.recording {
            if let Some(encoder_id) = self.encoder_id {
                encoder_pool.send_frame(encoder_id, frame)?;
            }
        }
        Ok(())
    }

    /// Get the latest frame for frontend consumption
    pub fn latest_frame_for_frontend(&self) -> Option<VideoFrameForFrontend> {
        self.latest_frame.as_ref().map(|f| f.to_frontend())
    }
}

/// Store all video streams
pub struct VideoStreams {
    streams: Arc<Mutex<HashMap<String, VideoStream>>>,
    encoder_pool: Arc<EncoderManager>,
}

// functions regarding our video streams
impl VideoStreams {
    pub fn new(encoder_pool: Arc<EncoderManager>) -> Self {
        Self{
            streams: Arc::new(Mutex::new(HashMap::new())),
            encoder_pool,
        }
    }

    pub fn create_stream(&self, name: &str) {
        let mut streams = self.streams.lock().unwrap();
        streams.entry(name.to_string()).or_insert_with(VideoStream::new);
    }

    pub fn push_frame(&self, name: &str, frame: VideoFrame) -> Result<(), String> {
        let mut streams = self.streams.lock().unwrap();
        if let Some(stream) = streams.get_mut(name) {
            stream.push_frame(frame, &self.encoder_pool)
        } else {
            Err("Stream not found".into())
        }
    }

    /// Start recording a named stream
    pub fn start_recording(
        &self,
        name: &str,
        path: PathBuf,
        width: u32,
        height: u32,
        fps: i32,
    ) -> Result<(), String> {
        let mut streams = self.streams.lock().unwrap();
        if let Some(stream) = streams.get_mut(name) {
            stream
                .start_recording(path, width, height, fps, &self.encoder_pool)
        } else {
            Err("Stream not found".into())
        }
    }

    /// Stop recording a named stream
    pub fn stop_recording(&self, name: &str) -> Result<(), String> {
        let mut streams = self.streams.lock().unwrap();
        if let Some(stream) = streams.get_mut(name) {
            stream.stop_recording(&self.encoder_pool)
        } else {
            Err("Stream not found".into())
        }
    }

    /// Get latest frame for a named stream (base64 for frontend)
    pub fn latest_frame(&self, name: &str) -> Option<VideoFrameForFrontend> {
        let streams = self.streams.lock().unwrap();
        streams.get(name)?.latest_frame_for_frontend()
    }

    /// List all stream names
    pub fn list_streams(&self) -> Vec<String> {
        let streams = self.streams.lock().unwrap();
        streams.keys().cloned().collect()
    }
    
    pub fn has_stream(&self, key: &str) -> bool {
        let streams = self.streams.lock().unwrap();
        streams.contains_key(key)
    }

    pub fn shutdown(&self) {
        let names = self.list_streams();
        let mut streams = self.streams.lock().unwrap();
        for name in names {
            let _ = self.stop_recording(&name);
        }
    }

}