// Middleware for video streaming, recording, and display

use std::fs::{File, OpenOptions};
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
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub format: String, // "jpeg", "png", "raw", etc.
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFrameForFrontend {
    pub timestamp: u64,
    pub data_base64: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
}

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

pub struct VideoStream {
    streams: Arc<Mutex<HashMap<String, VideoStreamData>>>,
}

struct VideoStreamData {
    recording: bool,
    video_file: Option<File>,
    video_path: Option<PathBuf>,
    frame_count: u64,
    latest_frame: Option<VideoFrame>,
}

impl VideoStreamData {
    fn new() -> Self {
        VideoStreamData {
            recording: false,
            video_file: None,
            video_path: None,
            frame_count: 0,
            latest_frame: None,
        }
    }
}

impl VideoStream {
    pub fn new() -> Self {
        VideoStream {
            streams: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start recording video for a specific stream key
    pub fn start_recording(&self, key: String, file_path: PathBuf) -> Result<(), String> {
        let mut streams = self.streams.lock().unwrap();
        
        let stream = streams.entry(key.clone()).or_insert_with(VideoStreamData::new);
        
        if stream.recording {
            return Err(format!("Stream {} already recording", key));
        }

        // Create video file
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&file_path)
            .map_err(|e| format!("Failed to create video file for {}: {}", key, e))?;

        stream.video_file = Some(file);
        stream.video_path = Some(file_path);
        stream.frame_count = 0;
        stream.recording = true;

        Ok(())
    }

    /// Stop recording video for a specific stream key
    pub fn stop_recording(&self, key: &str) -> Result<(PathBuf, u64), String> {
        let mut streams = self.streams.lock().unwrap();
        
        let stream = streams.get_mut(key)
            .ok_or_else(|| format!("Stream {} not found", key))?;
        
        if !stream.recording {
            return Err(format!("Stream {} not recording", key));
        }

        let frame_count = stream.frame_count;

        if let Some(mut file) = stream.video_file.take() {
            file.flush()
                .map_err(|e| format!("Failed to flush video file for {}: {}", key, e))?;
        }

        stream.recording = false;
        
        let path = stream.video_path
            .clone()
            .ok_or_else(|| format!("No video path found for {}", key))?;

        Ok((path, frame_count))
    }

    /// Stop all video recordings
    pub fn stop_all_recordings(&self) -> Result<HashMap<String, (PathBuf, u64)>, String> {
        let streams = self.streams.lock().unwrap();
        let keys: Vec<String> = streams.keys()
            .filter(|k| streams.get(*k).map(|s| s.recording).unwrap_or(false))
            .cloned()
            .collect();
        drop(streams);

        let mut results = HashMap::new();
        for key in keys {
            if let Ok((path, count)) = self.stop_recording(&key) {
                results.insert(key, (path, count));
            }
        }

        Ok(results)
    }

    /// Process a video frame for a specific stream
    pub fn process_frame(&self, key: String, frame: VideoFrame) -> Result<(), String> {
        let mut streams = self.streams.lock().unwrap();
        
        let stream = streams.entry(key.clone()).or_insert_with(VideoStreamData::new);
        
        // Store latest frame
        stream.latest_frame = Some(frame.clone());

        // Write to file if recording
        if stream.recording {
            if let Some(file) = stream.video_file.as_mut() {
                // Write frame header (timestamp, size, dimensions)
                let header = format!(
                    "FRAME|{}|{}|{}|{}|{}\n",
                    frame.timestamp,
                    frame.data.len(),
                    frame.width,
                    frame.height,
                    frame.format
                );
                
                file.write_all(header.as_bytes())
                    .map_err(|e| format!("Failed to write frame header for {}: {}", key, e))?;

                // Write frame data
                file.write_all(&frame.data)
                    .map_err(|e| format!("Failed to write frame data for {}: {}", key, e))?;

                file.write_all(b"\n")
                    .map_err(|e| format!("Failed to write frame delimiter for {}: {}", key, e))?;

                file.flush()
                    .map_err(|e| format!("Failed to flush video file for {}: {}", key, e))?;

                stream.frame_count += 1;
            }
        }

        Ok(())
    }

    /// Get the latest video frame for a specific stream
    pub fn get_latest_frame(&self, key: &str) -> Option<VideoFrame> {
        let streams = self.streams.lock().unwrap();
        streams.get(key)?.latest_frame.clone()
    }

    /// Get the latest frame as base64 for a specific stream
    pub fn get_latest_frame_base64(&self, key: &str) -> Option<VideoFrameForFrontend> {
        let streams = self.streams.lock().unwrap();
        streams.get(key)?
            .latest_frame
            .as_ref()
            .map(|frame| frame.to_frontend())
    }

    /// Get all available video stream keys
    pub fn get_all_keys(&self) -> Vec<String> {
        self.streams.lock().unwrap().keys().cloned().collect()
    }

    /// Check if a specific stream is recording
    pub fn is_recording(&self, key: &str) -> bool {
        self.streams.lock().unwrap()
            .get(key)
            .map(|s| s.recording)
            .unwrap_or(false)
    }

    /// Get all recording stream keys
    pub fn get_recording_keys(&self) -> Vec<String> {
        let streams = self.streams.lock().unwrap();
        streams.iter()
            .filter(|(_, s)| s.recording)
            .map(|(k, _)| k.clone())
            .collect()
    }

    /// Get frame count for a specific stream
    pub fn get_frame_count(&self, key: &str) -> u64 {
        self.streams.lock().unwrap()
            .get(key)
            .map(|s| s.frame_count)
            .unwrap_or(0)
    }

    /// Get total frame count across all streams
    pub fn get_total_frame_count(&self) -> u64 {
        self.streams.lock().unwrap()
            .values()
            .map(|s| s.frame_count)
            .sum()
    }

    /// Get video file path for a specific stream
    pub fn get_video_path(&self, key: &str) -> Option<PathBuf> {
        self.streams.lock().unwrap()
            .get(key)?
            .video_path
            .clone()
    }

    /// Get all video paths (both recording and not recording)
    pub fn get_all_video_paths(&self) -> HashMap<String, PathBuf> {
        let streams = self.streams.lock().unwrap();
        streams.iter()
            .filter_map(|(k, s)| s.video_path.as_ref().map(|p| (k.clone(), p.clone())))
            .collect()
    }
}

impl Default for VideoStream {
    fn default() -> Self {
        Self::new()
    }
}

/// Helper function to create a video frame from raw data
pub fn create_video_frame(
    data: Vec<u8>,
    width: u32,
    height: u32,
    format: String,
) -> VideoFrame {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    VideoFrame {
        timestamp,
        data,
        width,
        height,
        format,
    }
}












#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_video_stream() {
        let stream = VideoStream::new();
        
        // Create dummy frame
        let frame = VideoFrame {
            timestamp: 123456789,
            data: vec![0u8; 100],
            width: 640,
            height: 480,
            format: "jpeg".to_string(),
        };

        // Test processing frame
        assert!(stream.process_frame("camera1".to_string(), frame.clone()).is_ok());
        assert!(stream.get_latest_frame("camera1").is_some());

        // Test recording
        let temp_path = env::temp_dir().join("test_video.raw");
        assert!(stream.start_recording("camera1".to_string(), temp_path.clone()).is_ok());
        assert!(stream.is_recording("camera1"));
        
        assert!(stream.process_frame("camera1".to_string(), frame).is_ok());
        assert_eq!(stream.get_frame_count("camera1"), 1);
        
        assert!(stream.stop_recording("camera1").is_ok());
        assert!(!stream.is_recording("camera1"));

        // Cleanup
        let _ = std::fs::remove_file(temp_path);
    }

    #[test]
    fn test_multiple_streams() {
        let stream = VideoStream::new();
        
        let frame1 = VideoFrame {
            timestamp: 123456789,
            data: vec![1u8; 100],
            width: 640,
            height: 480,
            format: "jpeg".to_string(),
        };

        let frame2 = VideoFrame {
            timestamp: 123456790,
            data: vec![2u8; 100],
            width: 1920,
            height: 1080,
            format: "jpeg".to_string(),
        };

        // Process frames for different cameras
        stream.process_frame("camera1".to_string(), frame1).unwrap();
        stream.process_frame("camera2".to_string(), frame2).unwrap();

        // Check both streams exist
        let keys = stream.get_all_keys();
        assert_eq!(keys.len(), 2);
        assert!(keys.contains(&"camera1".to_string()));
        assert!(keys.contains(&"camera2".to_string()));

        // Check frame data is separate
        let latest1 = stream.get_latest_frame("camera1").unwrap();
        let latest2 = stream.get_latest_frame("camera2").unwrap();
        assert_eq!(latest1.width, 640);
        assert_eq!(latest2.width, 1920);
    }

    #[test]
    fn test_frame_conversion() {
        let frame = VideoFrame {
            timestamp: 123456789,
            data: vec![1, 2, 3, 4, 5],
            width: 100,
            height: 100,
            format: "jpeg".to_string(),
        };

        let frontend_frame = frame.to_frontend();
        assert!(!frontend_frame.data_base64.is_empty());
        assert_eq!(frontend_frame.width, 100);
        assert_eq!(frontend_frame.height, 100);
    }
}
