// Main middleware module

use std::sync::Arc;

pub mod video_streams;
pub mod telemetry_store;
pub mod video_encoder_manager;


#[derive(Clone)]
pub struct Middleware {
    // pub telemetry: Arc<TelemetryStore>,
    // pub video_streams: Arc<VideoStreams>
}