use serde::{Deserialize, Serialize};

pub struct ShutdownState {
    pub shutdown_tx: tokio::sync::watch::Sender<()>,
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
    pub telemetry_radio_port_tx: tokio::sync::watch::Sender<()>,
    pub live_video_port_tx: tokio::sync::watch::Sender<()>,
    pub tracking_video_port_tx: tokio::sync::watch::Sender<()>,
    pub tracker_port_tx: tokio::sync::watch::Sender<()>,
    pub direction_finding_port_tx: tokio::sync::watch::Sender<()>,
}