use gilrs::{Gilrs, Event, EventType, Axis};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::backend::telemetry_radio_interface::TelemetryRadioPayloadControlHandle;
use crate::middleware::{Middleware, telemetry_stores::TelemetryData};

const STORE_NAME: &str = "payload";

pub struct JoystickHandle;

pub struct JoystickInput {
    telem_handle: TelemetryRadioPayloadControlHandle,
    middleware: Arc<Mutex<Middleware>>,
}

pub fn new(
    telem_handle: TelemetryRadioPayloadControlHandle,
    middleware: Arc<Mutex<Middleware>>,
) -> (JoystickInput, JoystickHandle) {
    (JoystickInput { telem_handle, middleware }, JoystickHandle)
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

        loop {
            if shutdown.is_cancelled() {
                return;
            }

            println!("{}",x);

            while let Some(Event { event, .. }) = gilrs.next_event() {
                match event {
                    EventType::AxisChanged(Axis::LeftStickX, value, _) => x = value,
                    EventType::AxisChanged(Axis::LeftStickY, value, _) => y = value,
                    _ => {}
                }

                if let Err(e) = self.telem_handle.send_payload_control(y, x).await {
                    eprintln!("[joystick] Failed to send payload control: {e}");
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