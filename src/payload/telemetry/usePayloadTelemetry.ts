import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FlightState } from "../../rocket-dashboard/telemetry/types";
import { type Blob, type RawField, parseBlobs, stateLabel } from "./payloadFields";

const STORE = "payload";
const POLL_MS = 50;
const MAX_BLOBS = 8;

export interface Horizon {
  x1: number; y1: number; x2: number; y2: number; valid: boolean;
}

export interface PayloadSnapshot {
  state: FlightState | null;
  joystickX: number;
  joystickY: number;
  horizon: Horizon | null;
  blobs: Blob[];
}

const EMPTY: PayloadSnapshot = { state: null, joystickX: 0, joystickY: 0, horizon: null, blobs: [] };

const SCALAR_FIELD_NAMES = [
  "state", "joystick_x", "joystick_y",
  "horiz_x1", "horiz_y1", "horiz_x2", "horiz_y2", "horiz_valid",
] as const;

function blobFieldNames(maxBlobs: number): string[] {
  const names: string[] = [];
  for (let i = 0; i < maxBlobs; i++) {
    names.push(
      `blob_x${i}`, `blob_y${i}`, `blob_ellipse_a${i}`, `blob_ellipse_b${i}`,
      `blob_rotation${i}`, `blob_confidence${i}`,
    );
  }
  return names;
}

const FIELD_NAMES = [...SCALAR_FIELD_NAMES, ...blobFieldNames(MAX_BLOBS)];

async function latest(field: string): Promise<RawField | null> {
  try {
    return (await invoke<RawField | null>("get_latest_telemetry", { storeName: STORE, fieldName: field })) ?? null;
  } catch {
    return null;
  }
}

function n(f: RawField | null): number {
  const v = f ? Number(f.value) : NaN;
  return Number.isFinite(v) ? v : 0;
}

function buildSnapshot(map: Map<string, RawField>): PayloadSnapshot {
  const validField = map.get("horiz_valid") ?? null;
  const valid = validField ? validField.value === "true" || Number(validField.value) === 1 : false;

  return {
    state: stateLabel(map.get("state") ?? null),
    joystickX: n(map.get("joystick_x") ?? null),
    joystickY: n(map.get("joystick_y") ?? null),
    horizon: {
      x1: n(map.get("horiz_x1") ?? null),
      y1: n(map.get("horiz_y1") ?? null),
      x2: n(map.get("horiz_x2") ?? null),
      y2: n(map.get("horiz_y2") ?? null),
      valid,
    },
    blobs: parseBlobs(map, MAX_BLOBS),
  };
}

function snapshotsEqual(a: PayloadSnapshot, b: PayloadSnapshot): boolean {
  if (a.state !== b.state || a.joystickX !== b.joystickX || a.joystickY !== b.joystickY) return false;
  const ah = a.horizon;
  const bh = b.horizon;
  if (ah === null || bh === null) {
    if (ah !== bh) return false;
  } else if (
    ah.x1 !== bh.x1 || ah.y1 !== bh.y1 || ah.x2 !== bh.x2 || ah.y2 !== bh.y2 || ah.valid !== bh.valid
  ) {
    return false;
  }
  if (a.blobs.length !== b.blobs.length) return false;
  for (let i = 0; i < a.blobs.length; i++) {
    const x = a.blobs[i];
    const y = b.blobs[i];
    if (
      x.index !== y.index || x.x !== y.x || x.y !== y.y || x.a !== y.a ||
      x.b !== y.b || x.rotation !== y.rotation || x.confidence !== y.confidence
    ) {
      return false;
    }
  }
  return true;
}

export function usePayloadTelemetry(): PayloadSnapshot {
  const [snap, setSnap] = useState<PayloadSnapshot>(EMPTY);

  useEffect(() => {
    let stopped = false;
    let tickInFlight = false;
    let tickSeq = 0;

    const tick = async () => {
      if (tickInFlight || stopped) return;
      tickInFlight = true;
      const seq = ++tickSeq;
      try {
        const results = await Promise.all(FIELD_NAMES.map(latest));
        if (stopped || seq !== tickSeq) return;
        const map = new Map<string, RawField>();
        FIELD_NAMES.forEach((name, i) => { const r = results[i]; if (r) map.set(name, r); });
        const next = buildSnapshot(map);
        setSnap((prev) => (snapshotsEqual(prev, next) ? prev : next));
      } finally {
        tickInFlight = false;
      }
    };

    const timer = window.setInterval(() => void tick(), POLL_MS);
    void tick();
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  return snap;
}
