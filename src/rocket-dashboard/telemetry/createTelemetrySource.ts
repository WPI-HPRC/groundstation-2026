import { MOCK_UPDATE_HZ } from "../config";
import { MockTelemetrySource } from "./MockTelemetrySource";
import { TauriTelemetrySource } from "./TauriTelemetrySource";
import type { TelemetrySource } from "./TelemetrySource";

export function createTelemetrySource(): TelemetrySource {
  const isTauri = typeof window !== "undefined" && "__TAURI__" in window;
  return isTauri
    ? new TauriTelemetrySource({ updateHz: MOCK_UPDATE_HZ })
    : new MockTelemetrySource({ updateHz: MOCK_UPDATE_HZ });
}
