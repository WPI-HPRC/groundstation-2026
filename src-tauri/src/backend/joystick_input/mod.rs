use gilrs::{Gilrs, Event, EventType, Axis};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::backend::telemetry_radio_interface::TelemetryRadioPayloadControlHandle;
use crate::backend::tracker_interface::TrackerHandle;
use crate::middleware::{Middleware, telemetry_stores::TelemetryData};

const STORE_NAME: &str = "payload";

// Max angular velocity sent to the tracker in Remote mode (rad/s).
// Right stick at full deflection → this speed.
const MAX_TRACKER_VEL_RADS: f32 = std::f32::consts::PI / 2.0;

pub struct JoystickHandle;

pub struct JoystickInput {
    telem_handle: TelemetryRadioPayloadControlHandle,
    tracker_handle: TrackerHandle,
    middleware: Arc<Mutex<Middleware>>,
}

pub fn new(
    telem_handle: TelemetryRadioPayloadControlHandle,
    tracker_handle: TrackerHandle,
    middleware: Arc<Mutex<Middleware>>,
) -> (JoystickInput, JoystickHandle) {
    (JoystickInput { telem_handle, tracker_handle, middleware }, JoystickHandle)
}

impl JoystickInput {
    pub async fn run(self, shutdown: CancellationToken) {
        let mut gilrs = match Gilrs::new() {
            Ok(g) => g,
            Err(e) => {
                eprintln!("[joystick] Failed to initialize: {e}");
                return;
            }
        };

        let mut x: f32 = 0.0;
        let mut y: f32 = 0.0;
        let mut tracker_az: f32 = 0.0;
        let mut tracker_el: f32 = 0.0;

        loop {
            if shutdown.is_cancelled() {
                return;
            }

            while let Some(Event { event, .. }) = gilrs.next_event() {
                match event {
                    EventType::AxisChanged(Axis::LeftStickX, value, _) => x = value,
                    EventType::AxisChanged(Axis::LeftStickY, value, _) => y = value,
                    EventType::AxisChanged(Axis::RightStickX, value, _) => {
                        tracker_az = value * MAX_TRACKER_VEL_RADS;
                    }
                    EventType::AxisChanged(Axis::RightStickY, value, _) => {
                        tracker_el = value * MAX_TRACKER_VEL_RADS;
                    }
                    _ => {}
                }

                if let Err(e) = self.telem_handle.send_payload_control(y, x).await {
                    eprintln!("[joystick] Failed to send payload control: {e}");
                }

                if let Err(e) = self.tracker_handle.send_values(tracker_az, tracker_el).await {
                    eprintln!("[joystick] Failed to send tracker values: {e}");
                }

                let mut mw = self.middleware.lock().await;
                let _ = mw.push_data(
                    STORE_NAME,
                    "joystick_x",
                    TelemetryData::new().with_value(x as f64),
                );
                let _ = mw.push_data(
                    STORE_NAME,
                    "joystick_y",
                    TelemetryData::new().with_value(y as f64),
                );
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
        }
    }
}