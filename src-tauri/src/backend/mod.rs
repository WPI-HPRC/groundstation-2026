// Top-level backend module

use crate::channels::{self as Channels, PlaybackState};
use crate::middleware::Middleware;

// define the generic serial_interface module we'll use in the backend ONLY
pub(super) mod serial_interface;

// define our backend modules that the program will interact with
pub mod data_playback;
pub mod direction_finding_interface;
pub mod telemetry_radio_interface;
pub mod tracker_interface;
pub mod video_capture_interface;

