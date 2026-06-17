//! Mock telemetry generator. Ports the JS MockTelemetrySource flight profile and
//! pushes the same store keys the real radio handler writes. Gated by HPRC_MOCK_TELEM.

use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};
use tokio_util::sync::CancellationToken;

use crate::middleware::telemetry_stores::TelemetryData;
use crate::middleware::Middleware;

const TIME_SCALE: f64 = 3.5; // simulated seconds per UI tick batch (matches JS DEFAULT_TIME_SCALE)
const PROFILE_END: f64 = 185.0;
const UPDATE_HZ: f64 = 20.0;

const SEA_LEVEL_HPA: f64 = 1013.25;
const APOGEE_ALT_M: f64 = 7600.0;
const BURNOUT_ALT_M: f64 = 780.0;
const MAIN_DEPLOY_ALT_M: f64 = 550.0;
const MAX_ASCENT_VEL_MPS: f64 = 1700.0 / 3.28084;
const MAX_G_MPS2: f64 = 9.80665 * 1.7;

// Phase boundaries (state_index, until_seconds). 0=PreLaunch..6=Landed.
const PHASES: [(u32, f64); 7] = [
    (0, 5.0),
    (1, 9.0),
    (2, 34.0),
    (3, 36.0),
    (4, 145.0),
    (5, 175.0),
    (6, f64::INFINITY),
];

fn clamp(n: f64, lo: f64, hi: f64) -> f64 {
    n.min(hi).max(lo)
}
fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}
fn smoothstep(t: f64) -> f64 {
    let x = clamp(t, 0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}
fn ease_out_quad(t: f64) -> f64 {
    let x = clamp(t, 0.0, 1.0);
    1.0 - (1.0 - x) * (1.0 - x)
}
fn noise(t: f64, amplitude: f64, phase: f64) -> f64 {
    amplitude * ((t * 12.9898 + phase).sin() * 0.55 + (t * 4.1414 + phase * 1.7).sin() * 0.45)
}

fn state_at(t: f64) -> u32 {
    for (idx, until) in PHASES.iter() {
        if t < *until {
            return *idx;
        }
    }
    6
}

/// Inverse of the frontend barometric formula: altitude (m) -> pressure (hPa).
fn altitude_to_pressure_hpa(alt_m: f64) -> f64 {
    let alt = alt_m.max(0.0);
    SEA_LEVEL_HPA * (1.0 - alt / 44330.0).powf(1.0 / 0.1903)
}

fn quat_from_euler(roll: f64, pitch: f64, yaw: f64) -> [f64; 4] {
    let (cr, sr) = ((roll / 2.0).cos(), (roll / 2.0).sin());
    let (cp, sp) = ((pitch / 2.0).cos(), (pitch / 2.0).sin());
    let (cy, sy) = ((yaw / 2.0).cos(), (yaw / 2.0).sin());
    let w = cr * cp * cy + sr * sp * sy;
    let i = sr * cp * cy - cr * sp * sy;
    let j = cr * sp * cy + sr * cp * sy;
    let k = cr * cp * sy - sr * sp * cy;
    let n = (w * w + i * i + j * j + k * k).sqrt().max(1e-9);
    [w / n, i / n, j / n, k / n]
}

fn orientation_at(t: f64, state: u32) -> [f64; 4] {
    let rail = (std::f64::consts::PI / 180.0) * 4.0;
    match state {
        0 => quat_from_euler(0.0, rail, 0.0),
        1 => {
            let u = smoothstep((t - 5.0) / 4.0);
            quat_from_euler((t * 0.8).sin() * 0.02, rail + u * 0.035, (t * 0.4).sin() * 0.015)
        }
        2 => {
            let u = smoothstep((t - 9.0) / 25.0);
            quat_from_euler((t * 0.55).sin() * 0.04, rail + u * 0.08, (t * 0.3).sin() * 0.035)
        }
        3 => {
            let u = smoothstep((t - 34.0) / 2.0);
            quat_from_euler((t * 0.6).sin() * 0.08, rail + u * 0.18, (t * 0.45).sin() * 0.12)
        }
        4 => quat_from_euler(t * 2.4, (t * 0.72).sin() * 1.25, (t * 0.57).cos() * 1.1),
        5 => quat_from_euler(t * 0.55, (t * 0.31).sin() * 0.35, (t * 0.23).cos() * 0.35),
        _ => quat_from_euler(std::f64::consts::PI / 2.0, 0.15, 0.6),
    }
}

pub struct MockBlob {
    pub index: u32,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub a: i32,
    pub b: i32,
    pub rotation: i32,
    pub confidence: f64,
}

pub struct MockFrame {
    pub state_index: u32,
    pub voltage: f64,
    pub temp: f64,
    pub pressure: f64,
    pub accel: [f64; 3],
    pub gyro: [f64; 3],
    pub mag: [f64; 3],
    pub quat: [f64; 4], // w, i, j, k
    pub vel: [f64; 3],
    pub pos: [f64; 3],
    // payload extras
    pub joystick_x: f64,
    pub joystick_y: f64,
    pub horiz: (i32, i32, i32, i32, bool),
    pub blobs: Vec<MockBlob>,
}

pub fn build_frame(t: f64) -> MockFrame {
    let state = state_at(t);

    let (mut velocity, mut altitude, mut acceleration);
    match state {
        0 => {
            velocity = noise(t, 0.15, 0.0).max(0.0);
            altitude = noise(t, 0.6, 1.2).max(0.0);
            acceleration = 9.80665 + noise(t, 0.08, 2.1);
        }
        1 => {
            let u = (t - 5.0) / 4.0;
            let shaped = smoothstep(u);
            velocity = MAX_ASCENT_VEL_MPS * shaped + noise(t, 3.0, 0.4);
            altitude = BURNOUT_ALT_M * u * u * (0.65 + 0.35 * shaped);
            acceleration = clamp(
                9.80665 * lerp(1.15, 1.7, (clamp(u, 0.0, 1.0) * std::f64::consts::PI).sin()) + noise(t, 0.18, 0.8),
                9.80665,
                MAX_G_MPS2,
            );
        }
        2 => {
            let u = (t - 9.0) / 25.0;
            velocity = (MAX_ASCENT_VEL_MPS * (1.0 - smoothstep(u)) + noise(t, 1.8, 1.1)).max(0.0);
            altitude = BURNOUT_ALT_M + (APOGEE_ALT_M - BURNOUT_ALT_M) * ease_out_quad(u) + noise(t, 2.5, 1.9);
            acceleration = (0.45 + noise(t, 0.18, 2.4)).max(0.1);
        }
        3 => {
            let u = (t - 34.0) / 2.0;
            velocity = 3.0 + noise(t, 2.5, 0.7).abs();
            altitude = APOGEE_ALT_M - 8.0 * smoothstep(u) + noise(t, 1.2, 3.3);
            acceleration = 0.35 + noise(t, 0.12, 3.7);
        }
        4 => {
            let u = (t - 36.0) / 109.0;
            velocity = 72.0 + noise(t, 4.5, 0.3);
            altitude = lerp(APOGEE_ALT_M, MAIN_DEPLOY_ALT_M, smoothstep(u)) + noise(t, 4.0, 1.6);
            acceleration = 9.80665 * 0.78 + noise(t, 0.28, 0.9);
        }
        5 => {
            let u = (t - 145.0) / 30.0;
            velocity = 18.0 + noise(t, 1.2, 2.5);
            altitude = lerp(MAIN_DEPLOY_ALT_M, 0.0, smoothstep(u)) + noise(t, 1.6, 2.8);
            acceleration = 9.80665 * 0.9 + noise(t, 0.18, 1.4);
        }
        _ => {
            velocity = noise(t, 0.08, 3.1).max(0.0);
            altitude = noise(t, 0.25, 1.5).max(0.0);
            acceleration = 9.80665 + noise(t, 0.05, 0.6);
        }
    }
    altitude = altitude.max(0.0);
    velocity = velocity.max(0.0);
    acceleration = acceleration.max(0.0);

    let wind_u = clamp((t - 5.0) / 140.0, 0.0, 1.0);
    let east = 0.9 * t + 0.06 * altitude + 38.0 * (t / 27.0).sin() * wind_u + noise(t, 1.5, 4.1);
    let north = 0.55 * t - 0.018 * altitude + 24.0 * (t / 34.0 + 0.8).sin() * wind_u + noise(t, 1.2, 5.2);
    let vertical_accel = if state == 1 { acceleration - 9.80665 } else { acceleration };

    let accel = [
        noise(t, if state == 1 { 4.0 } else { 0.8 }, 0.5),
        noise(t, if state == 4 { 5.0 } else { 0.9 }, 1.5),
        vertical_accel + noise(t, if state == 1 { 5.0 } else { 0.7 }, 2.5),
    ];
    let gyro = [
        (if state == 4 { 80.0 } else { 14.0 }) * (t * 0.9).sin() + noise(t, 2.4, 1.1),
        (if state == 4 { 55.0 } else { 10.0 }) * (t * 0.7).cos() + noise(t, 2.2, 2.1),
        (if state == 1 { 180.0 } else { 18.0 }) + 12.0 * (t * 0.35).sin() + noise(t, 4.0, 3.1),
    ];
    let mag = [
        25.0 + 3.0 * (t * 0.08).sin() + noise(t, 0.6, 3.2),
        -8.0 + 2.5 * (t * 0.07).cos() + noise(t, 0.5, 4.2),
        40.0 + 2.0 * (t * 0.05 + altitude / 7000.0).sin() + noise(t, 0.45, 5.2),
    ];
    let voltage = clamp(
        12.6 - t * 0.004 - (if t > 36.0 { 0.18 } else { 0.0 }) - (if t > 145.0 { 0.14 } else { 0.0 }) + noise(t, 0.025, 2.2),
        10.8,
        12.7,
    );

    // payload extras: slow joystick sweep, a moving horizon, a few drifting blobs.
    let joystick_x = (t * 0.6).sin() * 0.7;
    let joystick_y = (t * 0.45).cos() * 0.5;
    let horiz_y = 360 + (50.0 * (t * 0.2).sin()) as i32;
    let horiz = (0, horiz_y, 1280, horiz_y + 40, true);
    let blobs = (0..3u32)
        .map(|k| {
            let phase = k as f64 * 2.1;
            MockBlob {
                index: k,
                x: (400 + 220 * k as i32) + (60.0 * (t * 0.5 + phase).sin()) as i32,
                y: (520 - 40 * k as i32) + (40.0 * (t * 0.4 + phase).cos()) as i32,
                width: 60,
                height: 50,
                a: 46 - 6 * k as i32,
                b: 28,
                rotation: (30.0 * (t * 0.3 + phase).sin()) as i32,
                confidence: clamp(0.8 + noise(t, 0.1, phase), 0.0, 1.0),
            }
        })
        .collect();

    MockFrame {
        state_index: state,
        voltage,
        temp: 30.0 - altitude * 0.0065 + noise(t, 0.35, 2.9),
        pressure: altitude_to_pressure_hpa(altitude),
        accel,
        gyro,
        mag,
        quat: orientation_at(t, state),
        vel: [0.0, 0.0, velocity], // mostly-vertical; frontend velocity = hypot
        pos: [east, north, altitude],
        joystick_x,
        joystick_y,
        horiz,
        blobs,
    }
}

fn push_frame(mw: &mut Middleware, ts: i64, f: &MockFrame) {
    let push_f = |mw: &mut Middleware, store: &str, field: &str, v: f64| {
        let _ = mw.push_data(store, field, TelemetryData::new().with_timestamp(ts).with_value(v));
    };

    // rocket store
    let _ = mw.push_data("rocket", "state", TelemetryData::new().with_timestamp(ts).with_value(f.state_index));
    push_f(mw, "rocket", "battery_voltage", f.voltage);
    push_f(mw, "rocket", "temp", f.temp);
    push_f(mw, "rocket", "pressure", f.pressure);
    push_f(mw, "rocket", "asm330_accel0", f.accel[0]);
    push_f(mw, "rocket", "asm330_accel1", f.accel[1]);
    push_f(mw, "rocket", "asm330_accel2", f.accel[2]);
    push_f(mw, "rocket", "asm330_gyr0", f.gyro[0]);
    push_f(mw, "rocket", "asm330_gyr1", f.gyro[1]);
    push_f(mw, "rocket", "asm330_gyr2", f.gyro[2]);
    push_f(mw, "rocket", "mag0", f.mag[0]);
    push_f(mw, "rocket", "mag1", f.mag[1]);
    push_f(mw, "rocket", "mag2", f.mag[2]);
    push_f(mw, "rocket", "w", f.quat[0]);
    push_f(mw, "rocket", "i", f.quat[1]);
    push_f(mw, "rocket", "j", f.quat[2]);
    push_f(mw, "rocket", "k", f.quat[3]);
    push_f(mw, "rocket", "vel_x", f.vel[0]);
    push_f(mw, "rocket", "vel_y", f.vel[1]);
    push_f(mw, "rocket", "vel_z", f.vel[2]);
    push_f(mw, "rocket", "pos_x", f.pos[0]);
    push_f(mw, "rocket", "pos_y", f.pos[1]);
    push_f(mw, "rocket", "pos_z", f.pos[2]);

    // payload store
    let _ = mw.push_data("payload", "state", TelemetryData::new().with_timestamp(ts).with_value(f.state_index));
    push_f(mw, "payload", "joystick_x", f.joystick_x);
    push_f(mw, "payload", "joystick_y", f.joystick_y);
    let _ = mw.push_data("payload", "horiz_x1", TelemetryData::new().with_timestamp(ts).with_value(f.horiz.0));
    let _ = mw.push_data("payload", "horiz_y1", TelemetryData::new().with_timestamp(ts).with_value(f.horiz.1));
    let _ = mw.push_data("payload", "horiz_x2", TelemetryData::new().with_timestamp(ts).with_value(f.horiz.2));
    let _ = mw.push_data("payload", "horiz_y2", TelemetryData::new().with_timestamp(ts).with_value(f.horiz.3));
    let _ = mw.push_data("payload", "horiz_valid", TelemetryData::new().with_timestamp(ts).with_value(f.horiz.4));
    for b in &f.blobs {
        let i = b.index;
        let _ = mw.push_data("payload", &format!("blob_x{i}"), TelemetryData::new().with_timestamp(ts).with_value(b.x));
        let _ = mw.push_data("payload", &format!("blob_y{i}"), TelemetryData::new().with_timestamp(ts).with_value(b.y));
        let _ = mw.push_data("payload", &format!("blob_width{i}"), TelemetryData::new().with_timestamp(ts).with_value(b.width));
        let _ = mw.push_data("payload", &format!("blob_height{i}"), TelemetryData::new().with_timestamp(ts).with_value(b.height));
        let _ = mw.push_data("payload", &format!("blob_ellipse_a{i}"), TelemetryData::new().with_timestamp(ts).with_value(b.a));
        let _ = mw.push_data("payload", &format!("blob_ellipse_b{i}"), TelemetryData::new().with_timestamp(ts).with_value(b.b));
        let _ = mw.push_data("payload", &format!("blob_rotation{i}"), TelemetryData::new().with_timestamp(ts).with_value(b.rotation));
        let _ = mw.push_data("payload", &format!("blob_confidence{i}"), TelemetryData::new().with_timestamp(ts).with_value(b.confidence));
    }
}

pub struct MockTelemetry {
    middleware: Arc<Mutex<Middleware>>,
}

pub fn new(middleware: Arc<Mutex<Middleware>>) -> MockTelemetry {
    MockTelemetry { middleware }
}

impl MockTelemetry {
    pub async fn run(self, shutdown: CancellationToken) {
        let dt = TIME_SCALE / UPDATE_HZ;
        let mut t = 0.0_f64;
        let mut ticker = interval(Duration::from_millis((1000.0 / UPDATE_HZ) as u64));

        loop {
            tokio::select! {
                _ = shutdown.cancelled() => return,
                _ = ticker.tick() => {
                    t += dt;
                    if t > PROFILE_END { t = 0.0; }
                    let frame = build_frame(t);
                    let ts = chrono::Utc::now().timestamp_millis();
                    let mut mw = self.middleware.lock().await;
                    push_frame(&mut mw, ts, &frame);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_in_prelaunch_and_ends_landed() {
        assert_eq!(build_frame(0.0).state_index, 0);
        assert_eq!(build_frame(200.0).state_index, 6);
    }

    #[test]
    fn state_progression_is_monotonic_over_the_profile() {
        let mut last = 0u32;
        let mut t = 0.0;
        while t <= PROFILE_END {
            let s = build_frame(t).state_index;
            assert!(s >= last, "state went backwards at t={t}: {s} < {last}");
            last = s;
            t += 0.5;
        }
        assert_eq!(last, 6);
    }

    #[test]
    fn values_are_finite_and_quat_is_normalized() {
        for i in 0..400 {
            let f = build_frame(i as f64 * 0.5);
            assert!(f.voltage.is_finite() && f.voltage > 0.0);
            assert!(f.pressure.is_finite() && f.pressure > 0.0);
            for c in f.accel.iter().chain(f.gyro.iter()).chain(f.mag.iter()) {
                assert!(c.is_finite());
            }
            let norm = (f.quat.iter().map(|q| q * q).sum::<f64>()).sqrt();
            assert!((norm - 1.0).abs() < 1e-6, "quat not normalized: {norm}");
        }
    }

    #[test]
    fn pressure_decreases_with_altitude() {
        assert!(altitude_to_pressure_hpa(0.0) > altitude_to_pressure_hpa(5000.0));
        assert!((altitude_to_pressure_hpa(0.0) - SEA_LEVEL_HPA).abs() < 1e-6);
    }
}
