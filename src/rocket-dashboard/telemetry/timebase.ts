import { FlightState } from "./types";

export type ChartTimeMode = "wall" | "mission";

/** Normalize backend timestamps to epoch milliseconds. */
export function normalizeEpochMs(ts: number, wallNow = Date.now()): number {
  if (!Number.isFinite(ts) || ts <= 0) return wallNow;
  // Values like 0–1e11 are usually seconds (or invalid), not epoch ms.
  if (ts < 1e12) return ts * 1000;
  return ts;
}

/** Update launch anchor when leaving PreLaunch; reset when re-entering PreLaunch. */
export function updateLaunchWallMs(
  state: FlightState,
  frameMs: number,
  launchWallMs: number | null,
  lastState: FlightState | null
): number | null {
  if (state === FlightState.PreLaunch && lastState !== FlightState.PreLaunch) {
    return null;
  }
  if (lastState === FlightState.PreLaunch && state !== FlightState.PreLaunch) {
    return frameMs;
  }
  return launchWallMs;
}

/** Chart x-value: wall-clock unix seconds pre-launch, T+ seconds after launch. */
export function chartX(
  frameMs: number,
  launchWallMs: number | null,
  wallNow = Date.now()
): number | null {
  const ts = normalizeEpochMs(frameMs, wallNow);
  if (launchWallMs == null) return ts / 1000;
  if (ts < launchWallMs) return null;
  return (ts - launchWallMs) / 1000;
}

export function formatConsolePrefix(
  launchWallMs: number | null,
  wallNow = Date.now()
): string {
  if (launchWallMs == null) {
    return (
      new Date(wallNow).toLocaleTimeString(undefined, { hour12: false }) +
      "." +
      String(wallNow % 1000).padStart(3, "0")
    );
  }
  return `T+${((wallNow - launchWallMs) / 1000).toFixed(2)}s`;
}
