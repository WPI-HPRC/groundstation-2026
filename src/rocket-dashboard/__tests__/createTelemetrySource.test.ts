import { describe, expect, it, afterEach } from "vitest";
import { createTelemetrySource } from "../telemetry/createTelemetrySource";
import { MockTelemetrySource } from "../telemetry/MockTelemetrySource";
import { TauriTelemetrySource } from "../telemetry/TauriTelemetrySource";

function clearTauriGlobals() {
  Reflect.deleteProperty(window, "__TAURI__");
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
}

describe("createTelemetrySource", () => {
  afterEach(() => {
    clearTauriGlobals();
  });

  it("uses TauriTelemetrySource when the Tauri v2 bridge is present", () => {
    clearTauriGlobals();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true,
    });

    expect(createTelemetrySource()).toBeInstanceOf(TauriTelemetrySource);
  });

  it("uses MockTelemetrySource outside Tauri", () => {
    clearTauriGlobals();

    expect(createTelemetrySource()).toBeInstanceOf(MockTelemetrySource);
  });
});
