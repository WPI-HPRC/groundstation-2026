import { useEffect, useRef, useState } from "react";
import type { TelemetrySource, TelemetrySourceWithDiagnostics } from "./TelemetrySource";
import type { TelemetryFrame } from "./types";
import { FlightState } from "./types";
import { RingBuffer } from "./ringBuffer";
import { PeakTracker } from "./peaks";
import { CHART_WINDOW, RENDER_HZ } from "../config";
import { chartX, normalizeEpochMs, updateLaunchWallMs, type ChartTimeMode } from "./timebase";

export interface TelemetrySnapshot {
  latest: TelemetryFrame | null;
  droppedFrames: number;
  /** Parallel arrays for charts: timestamps (s) + series values. */
  history: {
    /** Wall-clock unix seconds pre-launch; T+ seconds after launch. */
    t: number[];
    /** How to format the chart x-axis for the current flight phase. */
    timeMode: ChartTimeMode;
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
  const launchWallMsRef = useRef<number | null>(null);
  const lastStateRef = useRef<FlightState | null>(null);

  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(() => emptySnapshot());

  useEffect(() => {
    const unsub = source.subscribe((frame) => {
      const frameMs = normalizeEpochMs(frame.timestamp);
      launchWallMsRef.current = updateLaunchWallMs(
        frame.state,
        frameMs,
        launchWallMsRef.current,
        lastStateRef.current
      );
      lastStateRef.current = frame.state;
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
        setSnapshot(
          buildSnapshot(
            framesRef.current.toArray(),
            launchWallMsRef.current,
            maxVelRef.current.max,
            maxAccelRef.current.max,
            "diagnostics" in (source as any) ? (source as TelemetrySourceWithDiagnostics).diagnostics().droppedFrames : 0
          )
        );
      }
    }, minInterval);

    return () => {
      window.clearInterval(interval);
      unsub();
      source.stop();
      launchWallMsRef.current = null;
      lastStateRef.current = null;
    };
  }, [source]);

  return snapshot;
}

function emptySnapshot(): TelemetrySnapshot {
  return {
    latest: null,
    droppedFrames: 0,
    history: {
      t: [],
      timeMode: "wall",
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

function buildSnapshot(
  frames: TelemetryFrame[],
  launchWallMs: number | null,
  maxVel: number,
  maxAccel: number,
  droppedFrames: number
): TelemetrySnapshot {
  const s = emptySnapshot();
  s.droppedFrames = droppedFrames;
  if (frames.length === 0) return s;

  const wallNow = Date.now();
  s.history.timeMode = launchWallMs == null ? "wall" : "mission";

  for (const f of frames) {
    const x = chartX(f.timestamp, launchWallMs, wallNow);
    if (x == null) continue;
    s.history.t.push(x);
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
