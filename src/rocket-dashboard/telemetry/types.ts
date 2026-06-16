export type Vec3 = { x: number; y: number; z: number };

/** Quaternion in EKF convention. Three.js constructor order is (i, j, k, w). */
export type Quat = { w: number; i: number; j: number; k: number };

export enum FlightState {
  PreLaunch = "PreLaunch",
  Boost = "Boost",
  Coast = "Coast",
  Apogee = "Apogee",
  DrogueDescent = "DrogueDescent",
  MainDescent = "MainDescent",
  Landed = "Landed",
}

/** Ordered list used for deterministic state progression + indexing. */
export const FLIGHT_STATE_ORDER: FlightState[] = [
  FlightState.PreLaunch,
  FlightState.Boost,
  FlightState.Coast,
  FlightState.Apogee,
  FlightState.DrogueDescent,
  FlightState.MainDescent,
  FlightState.Landed,
];

export interface TelemetryFrame {
  timestamp: number; // ms epoch
  state: FlightState;
  orientation: Quat;
  velocity: number; // m/s, magnitude
  acceleration: number; // m/s^2, magnitude
  voltage: number; // V
  gyro: Vec3; // deg/s or rad/s (display only)
  accel: Vec3; // m/s^2
  mag: Vec3; // uT
  altitude: number; // m, baro-derived
  temperature: number; // deg C
  positionLocal: Vec3; // m, ENU from launch origin (x=East, y=North, z=Up)
}
