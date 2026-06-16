use serde::{Deserialize, Serialize};

use crate::backend::{self, video_capture_interface};

pub struct ShutdownState {
    pub shutdown: tokio_util::sync::CancellationToken,
}

pub struct PlaybackControlChannel {
    pub playback_tx: tokio::sync::watch::Sender<PlaybackState>,
    pub playback_rx: tokio::sync::watch::Receiver<PlaybackState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PlaybackState {
    NoData,
    NotStarted,
    Running,
    Paused,
    Done,
}

pub struct HardwarePorts {
    pub telemetry_radio_port_tx: tokio::sync::mpsc::Sender<String>,
    pub live_video_port_tx: tokio::sync::mpsc::Sender<String>,
    pub tracking_video_port_tx: tokio::sync::mpsc::Sender<String>,
    pub tracker_port_tx: tokio::sync::mpsc::Sender<String>,
    pub pointing_stick_port_tx: tokio::sync::mpsc::Sender<String>,
}

pub struct RemoteControlChannels {
    pub remote_control_tx: tokio::sync::mpsc::Sender<backend::telemetry_radio_interface::hprc::Command>,
    pub payload_control_tx: tokio::sync::mpsc::Sender<(f32,f32)>,
}

pub struct LiveVideoHandle(pub video_capture_interface::CameraHandle);
pub struct TrackingCameraHandle(pub video_capture_interface::CameraHandle);