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
}

// create constructor function
impl VideoStream {
    fn new() -> Self {
        VideoStream {
            recording: false,
            video_file: None,
            video_path: None,
            frame_count: 0,
            latest_frame: None,
        }
    }
}

/// Store all video streams
pub struct VideoStreams {
    streams: Arc<Mutex<HashMap<String, VideoStream>>>,
}

// functions regarding our video streams
impl VideoStreams {

}