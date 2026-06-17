import { MOCK_UPDATE_HZ } from "../config";
import { MockTelemetrySource } from "./MockTelemetrySource";
import { TauriTelemetrySource } from "./TauriTelemetrySource";
import type { TelemetrySource } from "./TelemetrySource";

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export function createTelemetrySource(): TelemetrySource {
  return isTauriRuntime()
    ? new TauriTelemetrySource({ updateHz: MOCK_UPDATE_HZ })
    : new MockTelemetrySource({ updateHz: MOCK_UPDATE_HZ });
}
