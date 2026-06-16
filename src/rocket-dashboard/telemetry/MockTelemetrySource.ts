import type { TelemetrySource, FrameCallback } from "./TelemetrySource";
import { FlightState, type TelemetryFrame, type Quat, type Vec3 } from "./types";

export interface MockOptions {
  updateHz?: number;
  loop?: boolean; // restart the profile after Landed
}

/** Phase boundaries as seconds-since-start. */
const PHASES: { state: FlightState; until: number }[] = [
  { state: FlightState.PreLaunch, until: 3 },
  { state: FlightState.Boost, until: 7 },
  { state: FlightState.Coast, until: 20 },
  { state: FlightState.Apogee, until: 22 },
  { state: FlightState.DrogueDescent, until: 35 },
  { state: FlightState.MainDescent, until: 50 },
  { state: FlightState.Landed, until: Number.POSITIVE_INFINITY },
];
const PROFILE_END = 55; // seconds; loop resets here

function stateAt(t: number): FlightState {
  for (const p of PHASES) if (t < p.until) return p.state;
  return FlightState.Landed;
}

/** Smooth-ish quaternion that rotates slowly about a tilting axis. */
function orientationAt(t: number): Quat {
  const angle = t * 0.6;
  const ax = Math.sin(t * 0.2);
  const ay = Math.cos(t * 0.17);
  const az = 1;
  const n = Math.hypot(ax, ay, az) || 1;
  const half = angle / 2;
  const s = Math.sin(half);
  const q: Quat = {
    w: Math.cos(half),
    i: (ax / n) * s,
    j: (ay / n) * s,
    k: (az / n) * s,
  };
  const qn = Math.hypot(q.w, q.i, q.j, q.k) || 1;
  return { w: q.w / qn, i: q.i / qn, j: q.j / qn, k: q.k / qn };
}

export class MockTelemetrySource implements TelemetrySource {
  private readonly hz: number;
  private readonly loop: boolean;
  private readonly subs = new Set<FrameCallback>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private t = 0; // seconds since profile start
  private prevVel = 0;

  constructor(opts: MockOptions = {}) {
    this.hz = opts.updateHz ?? 20;
    this.loop = opts.loop ?? true;
  }

  subscribe(cb: FrameCallback): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  start(): void {
    if (this.timer) return;
    const dt = 1 / this.hz;
    this.timer = setInterval(() => {
      this.t += dt;
      if (this.loop && this.t > PROFILE_END) {
        this.t = 0;
        this.prevVel = 0;
      }
      this.emit(this.buildFrame(this.t, dt));
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

  private buildFrame(t: number, dt: number): TelemetryFrame {
    const state = stateAt(t);

    // Velocity profile (m/s): climb hard during Boost, coast down, descend slow.
    let velocity: number;
    let altitude: number;
    if (t < 3) {
      velocity = 0;
      altitude = 0;
    } else if (t < 7) {
      velocity = (t - 3) * 75; // up to ~300 m/s
      altitude = 0.5 * 75 * (t - 3) ** 2;
    } else if (t < 22) {
      velocity = Math.max(0, 300 - (t - 7) * 20);
      altitude = 600 + (t - 7) * (300 - (t - 7) * 10);
    } else if (t < 50) {
      velocity = 25 + Math.sin(t) * 3; // descent
      altitude = Math.max(0, 3000 - (t - 22) * 100);
    } else {
      velocity = 0;
      altitude = 0;
    }

    const acceleration = Math.abs(velocity - this.prevVel) / dt;
    this.prevVel = velocity;

    // Local ENU trajectory: rises, drifts NE under wind.
    const positionLocal: Vec3 = {
      x: t * 4, // East drift
      y: t * 2.5, // North drift
      z: altitude, // Up
    };

    return {
      timestamp: Date.now(),
      state,
      orientation: orientationAt(t),
      velocity,
      acceleration,
      voltage: Math.max(0, 12.6 - t * 0.01), // slow drain
      gyro: { x: Math.sin(t) * 20, y: Math.cos(t * 1.1) * 15, z: Math.sin(t * 0.7) * 10 },
      accel: { x: Math.sin(t * 2) * 2, y: Math.cos(t * 2) * 2, z: 9.81 + Math.sin(t) },
      mag: { x: 25 + Math.sin(t) * 2, y: -8 + Math.cos(t) * 2, z: 40 + Math.sin(t * 0.5) },
      altitude,
      temperature: 20 - altitude * 0.0065, // lapse rate
      positionLocal,
    };
  }
}
