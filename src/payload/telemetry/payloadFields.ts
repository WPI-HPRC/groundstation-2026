import { FLIGHT_STATE_ORDER, FlightState } from "../../rocket-dashboard/telemetry/types";

export interface RawField {
  timestamp: number;
  value: string;
}

export interface Blob {
  index: number;
  x: number;
  y: number;
  a: number;
  b: number;
  rotation: number;
  confidence: number;
}

function num(field: RawField | null | undefined): number | null {
  if (!field) return null;
  const n = Number(field.value);
  return Number.isFinite(n) ? n : null;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function stateLabel(field: RawField | null): FlightState | null {
  const n = num(field);
  if (n == null) return null;
  return FLIGHT_STATE_ORDER[Math.trunc(n)] ?? null;
}

/** Joystick x/y in [-1,1] -> {left, top} fractions in [0,1]. y is up-positive. */
export function joystickToKnob(x: number, y: number): { left: number; top: number } {
  return {
    left: clamp01((x + 1) / 2),
    top: clamp01((1 - y) / 2),
  };
}

/** Reads blob_{x,y,ellipse_a,ellipse_b,rotation,confidence}{i} for i in 0..maxBlobs. */
export function parseBlobs(fields: Map<string, RawField>, maxBlobs: number): Blob[] {
  const out: Blob[] = [];
  for (let i = 0; i < maxBlobs; i++) {
    const x = num(fields.get(`blob_x${i}`));
    const y = num(fields.get(`blob_y${i}`));
    if (x == null || y == null) continue;
    out.push({
      index: i,
      x,
      y,
      a: num(fields.get(`blob_ellipse_a${i}`)) ?? 0,
      b: num(fields.get(`blob_ellipse_b${i}`)) ?? 0,
      rotation: num(fields.get(`blob_rotation${i}`)) ?? 0,
      confidence: num(fields.get(`blob_confidence${i}`)) ?? 0,
    });
  }
  return out;
}
