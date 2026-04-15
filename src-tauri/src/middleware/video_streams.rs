// Middleware module for video streaming, recording, and display
use dashmap::DashMap;
use std::path::PathBuf;
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use serde::{Deserialize, Serialize};
use base64::{Engine as _, engine::general_purpose};
use crate::middleware::video_encoder_manager::{EncoderId, EncoderManager};


#[derive(Debug, Clone, Serialize, Deserialize)]
// RAW VIDEO
pub struct VideoFrame {
    pub timestamp: i64,
    pub data: Vec<u8>, // 8 bit color, stored R,G,B then same for next pixel
    pub width: u32,
    pub height: u32,
}

// provide builtin function on the frame to convert to base-64 encoded version for frontend
impl VideoFrame {
    pub fn to_frontend_base64(&self) -> String {
        general_purpose::STANDARD.encode(&self.data)
    }
}

pub type SharedFrame = Arc<VideoFrame>;

/// store a specific video stream
struct VideoStream {
    recording: AtomicBool,

    video_path: Option<PathBuf>,
    frame_count: u64,

    latest_frame: Option<SharedFrame>,
    encoder_id: Option<EncoderId>,
}

// create constructor function
impl VideoStream {
    pub fn new() -> Self {
        VideoStream {
            recording: AtomicBool::new(false),
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
        if self.recording.load(Ordering::Acquire) {
            return Err("Already recording".into());
        }

        // Create a new encoder for this stream
        let encoder_id = encoder_pool.create_encoder();
        encoder_pool
            .start(encoder_id, path.to_string_lossy().to_string(), width, height, fps)?;

        self.recording.store(true, Ordering::Release);
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

        self.recording.store(false, Ordering::Release);
        Ok(())
    }

    /// Push a frame to this stream (latest frame + encoder if recording)
    pub fn push_frame(
        &mut self,
        frame: SharedFrame,
        encoder_pool: &EncoderManager,
    ) -> Result<(), String> {
        self.latest_frame = Some(frame.clone());
        self.frame_count += 1;

        if self.recording.load(Ordering::Acquire) {
            if let Some(id) = self.encoder_id {
                encoder_pool.send_frame(id, (*frame).clone())?;
            }
        }
        Ok(())
    }

    /// Get the latest frame for frontend consumption
    pub fn latest_frame(&self) -> Option<SharedFrame> {
        self.latest_frame.clone()
    }
}



/// Store all video streams
pub struct VideoStreams {
    streams: DashMap<String, VideoStream>,
    encoder_pool: Arc<EncoderManager>,
}

// functions regarding our video streams
impl VideoStreams {
    pub fn new(encoder_pool: Arc<EncoderManager>) -> Self {
        Self{
            streams: DashMap::new(),
            encoder_pool,
        }
    }

    pub fn shutdown(&self) {
        for mut stream in self.streams.iter_mut() {
            let _ = stream.stop_recording(&self.encoder_pool);
        }
    }



    pub fn create_stream(&self, name: &str) {
        self.streams
            .entry(name.to_string())
            .or_insert_with(|| VideoStream::new());
    }

    // List all stream names
    pub fn list_streams(&self) -> Vec<String> {
        self.streams.iter().map(|e| e.key().clone()).collect()
    }
    
    pub fn has_stream(&self, name: &str) -> bool {
        self.streams.contains_key(name)
    }

    pub fn push_frame(&self, name: &str, frame: SharedFrame) -> Result<(), String> {
        let mut stream = self.streams.get_mut(name).ok_or_else(|| format!("Stream not found: '{}'", name))?;
        stream.push_frame(frame, &self.encoder_pool)
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
        let mut stream = self
            .streams
            .get_mut(name)
            .ok_or_else(|| format!("Stream not found: '{}'", name))?;

        stream.start_recording(
            path,
            width,
            height,
            fps,
            &self.encoder_pool
        )
    }

    /// Stop recording a named stream
    pub fn stop_recording(&self, name: &str) -> Result<(), String> {
        let mut stream = self
            .streams
            .get_mut(name)
            .ok_or_else(|| format!("Stream not found: {}", name))?;

        stream.stop_recording(&self.encoder_pool)
    }

    // Get latest frame for a named stream (base64 for frontend)
    pub fn latest_frame(
        &self,
        name: &str,
    ) -> Option<SharedFrame> {
        self.streams
            .get(name)
            .and_then(|s| s.latest_frame())
    }

    pub fn latest_frame_base64(
        &self,
        name: &str,
    ) -> Option<(i64, String, u32, u32)> {
        let stream = self.streams.get(name)?;
        let frame = stream.latest_frame()?;

        Some((
            frame.timestamp,
            frame.to_frontend_base64(),
            frame.width,
            frame.height,
        ))
    }



}