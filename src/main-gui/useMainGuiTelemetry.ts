import { useEffect, useMemo, useReducer } from "react";
import { createTelemetrySource } from "../rocket-dashboard/telemetry/createTelemetrySource";
import { FlightState, useTelemetry } from "../rocket-dashboard/telemetry/useTelemetry";
import type { TelemetryFrame } from "../rocket-dashboard/telemetry/types";
import type { TrajectoryPoint } from "../Components/TrajectoryViewer";

const M_TO_FT = 3.28084;
const MPS_TO_FPS = 3.28084;
const G_MPS2 = 9.80665;
const ALTITUDE_MAX_FT = 30000;
const TRAJECTORY_POINT_LIMIT = 2000;

type TrajectoryState = {
  points: TrajectoryPoint[];
  flightSession: number;
  lastState: FlightState | null;
  lastTimestamp: number | null;
};

const initialTrajectoryState: TrajectoryState = {
  points: [],
  flightSession: 0,
  lastState: null,
  lastTimestamp: null,
};

function trajectoryReducer(state: TrajectoryState, frame: TelemetryFrame): TrajectoryState {
  if (state.lastTimestamp === frame.timestamp) return state;

  const enteringPreLaunch =
    frame.state === FlightState.PreLaunch &&
    state.lastState !== null &&
    state.lastState !== FlightState.PreLaunch;
  const timestampRewound = state.lastTimestamp !== null && frame.timestamp < state.lastTimestamp;
  const shouldReset = enteringPreLaunch || timestampRewound;

  const p = frame.positionLocal;
  const nextPoints = (shouldReset ? [] : state.points).concat({ x: p.x, y: p.z, z: p.y });

  return {
    points:
      nextPoints.length > TRAJECTORY_POINT_LIMIT
        ? nextPoints.slice(nextPoints.length - TRAJECTORY_POINT_LIMIT)
        : nextPoints,
    flightSession: shouldReset ? state.flightSession + 1 : state.flightSession,
    lastState: frame.state,
    lastTimestamp: frame.timestamp,
  };
}

export function useMainGuiTelemetry() {
  const source = useMemo(() => createTelemetrySource(), []);
  const snap = useTelemetry(source);
  const latest = snap.latest;
  const [trajectoryState, updateTrajectory] = useReducer(trajectoryReducer, initialTrajectoryState);

  useEffect(() => {
    if (latest) updateTrajectory(latest);
  }, [latest]);

  const altitudeFt = Math.max(0, latest?.altitude ?? 0) * M_TO_FT;
  const speedFtS = 0; //Math.max(0, latest?.velocity ?? 0) * MPS_TO_FPS;
  const gForce = Math.max(0, latest?.acceleration ?? 0) / G_MPS2;
  const q = latest?.orientation ?? { w: 1, i: 0, j: 0, k: 0 };

  return {
    altitudeFt,
    altitudeProgress: altitudeFt / ALTITUDE_MAX_FT,
    speedFtS,
    gForce,
    quaternion: { x: q.i, y: q.j, z: q.k, w: q.w },
    trajectoryPoints: trajectoryState.points,
    flightSession: trajectoryState.flightSession,
  };
}
