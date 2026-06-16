import { useEffect, useRef, useState } from "react";
import type { TelemetrySource } from "./TelemetrySource";
import type { TelemetryFrame } from "./types";
import { FlightState } from "./types";
import { RingBuffer } from "./ringBuffer";
import { PeakTracker } from "./peaks";
import { CHART_WINDOW, RENDER_HZ } from "../config";

export interface TelemetrySnapshot {
  latest: TelemetryFrame | null;
  /** Parallel arrays for charts: timestamps (s) + series values. */
  history: {
    t: number[]; // seconds relative to first sample
    gyro: [number[], number[], number[]];
    accel: [number[], number[], number[]];
    mag: [number[], number[], number[]];
    altitude: number[];
    temperature: number[];
    velocity: number[];
  };
  path: { lat: number[]; lon: number[]; alt: number[] }; // filled by map via geo.ts at render
  positionLocal: { x: number[]; y: number[]; z: number[] };
  maxVel: number;
  maxAccel: number;
}

/**
 * Subscribes to a TelemetrySource, accumulates frames in ring buffers at the
 * source's native rate, and republishes a render snapshot at ~RENDER_HZ.
 */
export function useTelemetry(source: TelemetrySource): TelemetrySnapshot {
  const framesRef = useRef(new RingBuffer<TelemetryFrame>(CHART_WINDOW));
  const maxVelRef = useRef(new PeakTracker());
  const maxAccelRef = useRef(new PeakTracker());
  const versionRef = useRef(0);

  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(() => emptySnapshot());

  useEffect(() => {
    const unsub = source.subscribe((frame) => {
      framesRef.current.push(frame);
      maxVelRef.current.update(frame.velocity);
      maxAccelRef.current.update(frame.acceleration);
      versionRef.current++;
    });
    source.start();

    let lastVersionRendered = -1;
    const minInterval = 1000 / RENDER_HZ;

    const interval = window.setInterval(() => {
      const v = versionRef.current;
      if (v !== lastVersionRendered) {
        lastVersionRendered = v;
        setSnapshot(buildSnapshot(framesRef.current.toArray(), maxVelRef.current.max, maxAccelRef.current.max));
      }
    }, minInterval);

    return () => {
      window.clearInterval(interval);
      unsub();
      source.stop();
    };
  }, [source]);

  return snapshot;
}

function emptySnapshot(): TelemetrySnapshot {
  return {
    latest: null,
    history: {
      t: [],
      gyro: [[], [], []],
      accel: [[], [], []],
      mag: [[], [], []],
      altitude: [],
      temperature: [],
      velocity: [],
    },
    path: { lat: [], lon: [], alt: [] },
    positionLocal: { x: [], y: [], z: [] },
    maxVel: 0,
    maxAccel: 0,
  };
}

function buildSnapshot(frames: TelemetryFrame[], maxVel: number, maxAccel: number): TelemetrySnapshot {
  const s = emptySnapshot();
  if (frames.length === 0) return s;
  const t0 = frames[0].timestamp;
  for (const f of frames) {
    const ts = (f.timestamp - t0) / 1000;
    s.history.t.push(ts);
    s.history.gyro[0].push(f.gyro.x);
    s.history.gyro[1].push(f.gyro.y);
    s.history.gyro[2].push(f.gyro.z);
    s.history.accel[0].push(f.accel.x);
    s.history.accel[1].push(f.accel.y);
    s.history.accel[2].push(f.accel.z);
    s.history.mag[0].push(f.mag.x);
    s.history.mag[1].push(f.mag.y);
    s.history.mag[2].push(f.mag.z);
    s.history.altitude.push(f.altitude);
    s.history.temperature.push(f.temperature);
    s.history.velocity.push(f.velocity);
    s.positionLocal.x.push(f.positionLocal.x);
    s.positionLocal.y.push(f.positionLocal.y);
    s.positionLocal.z.push(f.positionLocal.z);
  }
  s.latest = frames[frames.length - 1];
  s.maxVel = maxVel;
  s.maxAccel = maxAccel;
  return s;
}

export { FlightState };
