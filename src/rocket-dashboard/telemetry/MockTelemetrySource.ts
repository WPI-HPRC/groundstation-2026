import type { TelemetrySource, FrameCallback } from "./TelemetrySource";
import { FlightState, type TelemetryFrame, type Quat, type Vec3 } from "./types";

export interface MockOptions {
  updateHz?: number;
  loop?: boolean; // restart the profile after Landed
  /** Simulated flight seconds per wall-clock second. Keeps realistic values demo-friendly. */
  timeScale?: number;
}

/** Phase boundaries as seconds-since-start. */
const PHASES: { state: FlightState; until: number }[] = [
  { state: FlightState.PreLaunch, until: 5 },
  { state: FlightState.Boost, until: 9 },
  { state: FlightState.Coast, until: 34 },
  { state: FlightState.Apogee, until: 36 },
  { state: FlightState.DrogueDescent, until: 145 },
  { state: FlightState.MainDescent, until: 175 },
  { state: FlightState.Landed, until: Number.POSITIVE_INFINITY },
];
const PROFILE_END = 185; // simulated seconds; loop resets here
const DEFAULT_TIME_SCALE = 3.5;

const APOGEE_ALT_M = 7600; // ~24,900 ft
const BURNOUT_ALT_M = 780;
const MAIN_DEPLOY_ALT_M = 550;
const MAX_ASCENT_VEL_MPS = 1700 / 3.28084; // 1700 ft/s
const MAX_G_MPS2 = 9.80665 * 1.7;

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function easeOutQuad(t: number): number {
  const x = clamp(t, 0, 1);
  return 1 - (1 - x) * (1 - x);
}

function noise(t: number, amplitude: number, phase = 0): number {
  return amplitude * (Math.sin(t * 12.9898 + phase) * 0.55 + Math.sin(t * 4.1414 + phase * 1.7) * 0.45);
}

function stateAt(t: number): FlightState {
  for (const p of PHASES) if (t < p.until) return p.state;
  return FlightState.Landed;
}

function quatFromEuler(roll: number, pitch: number, yaw: number): Quat {
  const cr = Math.cos(roll / 2);
  const sr = Math.sin(roll / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const q: Quat = {
    w: cr * cp * cy + sr * sp * sy,
    i: sr * cp * cy - cr * sp * sy,
    j: cr * sp * cy + sr * cp * sy,
    k: cr * cp * sy - sr * sp * cy,
  };
  const qn = Math.hypot(q.w, q.i, q.j, q.k) || 1;
  return { w: q.w / qn, i: q.i / qn, j: q.j / qn, k: q.k / qn };
}

/** Flight-like attitude: mostly vertical through apogee, then unstable under recovery. */
function orientationAt(t: number, state: FlightState): Quat {
  const railCocked = (Math.PI / 180) * 4;
  if (state === FlightState.PreLaunch) {
    return quatFromEuler(0, railCocked, 0);
  }
  if (state === FlightState.Boost) {
    const u = smoothstep((t - 5) / 4);
    return quatFromEuler(Math.sin(t * 0.8) * 0.02, railCocked + u * 0.035, Math.sin(t * 0.4) * 0.015);
  }
  if (state === FlightState.Coast) {
    const u = smoothstep((t - 9) / 25);
    return quatFromEuler(Math.sin(t * 0.55) * 0.04, railCocked + u * 0.08, Math.sin(t * 0.3) * 0.035);
  }
  if (state === FlightState.Apogee) {
    const u = smoothstep((t - 34) / 2);
    return quatFromEuler(Math.sin(t * 0.6) * 0.08, railCocked + u * 0.18, Math.sin(t * 0.45) * 0.12);
  }
  if (state === FlightState.DrogueDescent) {
    return quatFromEuler(t * 2.4, Math.sin(t * 0.72) * 1.25, Math.cos(t * 0.57) * 1.1);
  }
  if (state === FlightState.MainDescent) {
    return quatFromEuler(t * 0.55, Math.sin(t * 0.31) * 0.35, Math.cos(t * 0.23) * 0.35);
  }
  return quatFromEuler(Math.PI / 2, 0.15, 0.6);
}

export class MockTelemetrySource implements TelemetrySource {
  private readonly hz: number;
  private readonly loop: boolean;
  private readonly timeScale: number;
  private readonly subs = new Set<FrameCallback>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private t = 0; // seconds since profile start

  constructor(opts: MockOptions = {}) {
    this.hz = opts.updateHz ?? 20;
    this.loop = opts.loop ?? true;
    this.timeScale = opts.timeScale ?? DEFAULT_TIME_SCALE;
  }

  subscribe(cb: FrameCallback): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  start(): void {
    if (this.timer) return;
    const dt = this.timeScale / this.hz;
    this.timer = setInterval(() => {
      this.t += dt;
      if (this.loop && this.t > PROFILE_END) {
        this.t = 0;
      }
      this.emit(this.buildFrame(this.t));
    }, 1000 / this.hz);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private emit(frame: TelemetryFrame): void {
    for (const cb of this.subs) cb(frame);
  }

  private buildFrame(t: number): TelemetryFrame {
    const state = stateAt(t);

    let velocity: number;
    let altitude: number;
    let acceleration: number;

    if (state === FlightState.PreLaunch) {
      velocity = Math.max(0, noise(t, 0.15));
      altitude = Math.max(0, noise(t, 0.6, 1.2));
      acceleration = 9.80665 + noise(t, 0.08, 2.1);
    } else if (state === FlightState.Boost) {
      const u = (t - 5) / 4;
      const shaped = smoothstep(u);
      velocity = MAX_ASCENT_VEL_MPS * shaped + noise(t, 3, 0.4);
      altitude = BURNOUT_ALT_M * u * u * (0.65 + 0.35 * shaped);
      acceleration = clamp(
        9.80665 * lerp(1.15, 1.7, Math.sin(clamp(u, 0, 1) * Math.PI)) + noise(t, 0.18, 0.8),
        9.80665,
        MAX_G_MPS2
      );
    } else if (state === FlightState.Coast) {
      const u = (t - 9) / 25;
      velocity = Math.max(0, MAX_ASCENT_VEL_MPS * (1 - smoothstep(u)) + noise(t, 1.8, 1.1));
      altitude = BURNOUT_ALT_M + (APOGEE_ALT_M - BURNOUT_ALT_M) * easeOutQuad(u) + noise(t, 2.5, 1.9);
      acceleration = Math.max(0.1, 0.45 + noise(t, 0.18, 2.4));
    } else if (state === FlightState.Apogee) {
      const u = (t - 34) / 2;
      velocity = 3 + Math.abs(noise(t, 2.5, 0.7));
      altitude = APOGEE_ALT_M - 8 * smoothstep(u) + noise(t, 1.2, 3.3);
      acceleration = 0.35 + noise(t, 0.12, 3.7);
    } else if (state === FlightState.DrogueDescent) {
      const u = (t - 36) / 109;
      velocity = 72 + noise(t, 4.5, 0.3);
      altitude = lerp(APOGEE_ALT_M, MAIN_DEPLOY_ALT_M, smoothstep(u)) + noise(t, 4, 1.6);
      acceleration = 9.80665 * 0.78 + noise(t, 0.28, 0.9);
    } else if (state === FlightState.MainDescent) {
      const u = (t - 145) / 30;
      velocity = 18 + noise(t, 1.2, 2.5);
      altitude = lerp(MAIN_DEPLOY_ALT_M, 0, smoothstep(u)) + noise(t, 1.6, 2.8);
      acceleration = 9.80665 * 0.9 + noise(t, 0.18, 1.4);
    } else {
      velocity = Math.max(0, noise(t, 0.08, 3.1));
      altitude = Math.max(0, noise(t, 0.25, 1.5));
      acceleration = 9.80665 + noise(t, 0.05, 0.6);
    }

    altitude = Math.max(0, altitude);
    velocity = Math.max(0, velocity);
    acceleration = Math.max(0, acceleration);

    const windU = clamp((t - 5) / 140, 0, 1);
    const eastDrift = 0.9 * t + 0.06 * altitude + 38 * Math.sin(t / 27) * windU;
    const northDrift = 0.55 * t - 0.018 * altitude + 24 * Math.sin(t / 34 + 0.8) * windU;
    const verticalAccel = state === FlightState.Boost ? acceleration - 9.80665 : acceleration;

    const positionLocal: Vec3 = {
      x: eastDrift + noise(t, 1.5, 4.1),
      y: northDrift + noise(t, 1.2, 5.2),
      z: altitude,
    };

    return {
      timestamp: Date.now(),
      state,
      orientation: orientationAt(t, state),
      velocity,
      acceleration,
      voltage: clamp(
        12.6 - t * 0.004 - (t > 36 ? 0.18 : 0) - (t > 145 ? 0.14 : 0) + noise(t, 0.025, 2.2),
        10.8,
        12.7
      ),
      gyro: {
        x: (state === FlightState.DrogueDescent ? 80 : 14) * Math.sin(t * 0.9) + noise(t, 2.4, 1.1),
        y: (state === FlightState.DrogueDescent ? 55 : 10) * Math.cos(t * 0.7) + noise(t, 2.2, 2.1),
        z: (state === FlightState.Boost ? 180 : 18) + 12 * Math.sin(t * 0.35) + noise(t, 4, 3.1),
      },
      accel: {
        x: noise(t, state === FlightState.Boost ? 4 : 0.8, 0.5),
        y: noise(t, state === FlightState.DrogueDescent ? 5 : 0.9, 1.5),
        z: verticalAccel + noise(t, state === FlightState.Boost ? 5 : 0.7, 2.5),
      },
      mag: {
        x: 25 + 3 * Math.sin(t * 0.08) + noise(t, 0.6, 3.2),
        y: -8 + 2.5 * Math.cos(t * 0.07) + noise(t, 0.5, 4.2),
        z: 40 + 2 * Math.sin(t * 0.05 + altitude / 7000) + noise(t, 0.45, 5.2),
      },
      altitude,
      temperature: 30 - altitude * 0.0065 + noise(t, 0.35, 2.9),
      positionLocal,
    };
  }
}
