import { useEffect, useMemo, useReducer } from "react";
import "./App.css";
import logo from "./Resources/HPRC-Logo-and-Text.svg";
import ArcGauge from "./Components/ArcGauge";
import ProgressBar from "./Components/ProgressBar";
import { RocketViewer } from "./Components/RocketViewer";
import { TrajectoryViewer, type TrajectoryPoint } from "./Components/TrajectoryViewer";
import { MaxStats } from "./Components/MaxStats";
import { createTelemetrySource } from "./rocket-dashboard/telemetry/createTelemetrySource";
import { FlightState, useTelemetry } from "./rocket-dashboard/telemetry/useTelemetry";
import type { TelemetryFrame } from "./rocket-dashboard/telemetry/types";

const M_TO_FT = 3.28084;
const MPS_TO_MPH = 2.23694;
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

function App() {
  const source = useMemo(() => createTelemetrySource(), []);
  const snap = useTelemetry(source);
  const latest = snap.latest;
  const [trajectoryState, updateTrajectory] = useReducer(trajectoryReducer, initialTrajectoryState);

  useEffect(() => {
    if (latest) updateTrajectory(latest);
  }, [latest]);

  const altitudeFt = Math.max(0, latest?.altitude ?? 0) * M_TO_FT;
  const speedMph = Math.max(0, latest?.velocity ?? 0) * MPS_TO_MPH;
  const gForce = Math.max(0, latest?.acceleration ?? 0) / G_MPS2;
  const q = latest?.orientation ?? { w: 1, i: 0, j: 0, k: 0 };

  return (
    <main className="container">
      <div className="video-layer" aria-hidden="true" />
      <ProgressBar
        title="Altitude (AGL)"
        secondary="UNOFFICIAL"
        ticknames={['0 ft', '10 kft', '20 kft', '30 kft']}
        tickvalues={[0, 0.333, 0.667, 1.0]}
        progress={altitudeFt / ALTITUDE_MAX_FT}
        thickness="8px"
      ></ProgressBar>
      <TrajectoryViewer points={trajectoryState.points}></TrajectoryViewer>

      {/* <LiveVideo></LiveVideo> */}

      <div className="container-secondary" id="gauges-container">
        <MaxStats
          data={{ speed: speedMph, altitude: altitudeFt, gForce }}
          resetKey={trajectoryState.flightSession}
        ></MaxStats>
        <RocketViewer quaternion={{ x: q.i, y: q.j, z: q.k, w: q.w }}></RocketViewer>
        <div className="container-secondary" id="title-container">
          <div className="logo-container">
            <p id="title-primary">WPI</p>
            <img src={logo} id="logo-img"></img>
          </div>
        </div>
        <ArcGauge
          value={Math.round(speedMph)}
          min={0}
          max={700}
          units="MPH"
          label="SPEED"
        />
        <ArcGauge
          value={Number(gForce.toFixed(1))}
          min={0}
          max={18}
          units="&nbsp;"
          label="G-FORCE"
        />
      </div>
    </main>
  );
}

export default App;
