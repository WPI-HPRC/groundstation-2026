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

export function usePayloadTelemetry(): PayloadSnapshot {
  const [snap, setSnap] = useState<PayloadSnapshot>(EMPTY);

  useEffect(() => {
    let stopped = false;

    const blobFieldNames = (): string[] => {
      const names: string[] = [];
      for (let i = 0; i < MAX_BLOBS; i++) {
        names.push(`blob_x${i}`, `blob_y${i}`, `blob_ellipse_a${i}`, `blob_ellipse_b${i}`, `blob_rotation${i}`, `blob_confidence${i}`);
      }
      return names;
    };

    const tick = async () => {
      const scalarNames = ["state", "joystick_x", "joystick_y", "horiz_x1", "horiz_y1", "horiz_x2", "horiz_y2", "horiz_valid"];
      const names = [...scalarNames, ...blobFieldNames()];
      const results = await Promise.all(names.map(latest));
      if (stopped) return;
      const map = new Map<string, RawField>();
      names.forEach((name, i) => { const r = results[i]; if (r) map.set(name, r); });

      const validField = map.get("horiz_valid") ?? null;
      const valid = validField ? validField.value === "true" || Number(validField.value) === 1 : false;

      setSnap({
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
      });
    };

    const timer = window.setInterval(() => void tick(), POLL_MS);
    void tick();
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  return snap;
}
