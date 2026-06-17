import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { usePayloadTelemetry } from "../telemetry/usePayloadTelemetry";

describe("usePayloadTelemetry", () => {
  beforeEach(() => { vi.useFakeTimers(); invokeMock.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it("requests the payload store joystick fields", async () => {
    invokeMock.mockResolvedValue(null);
    renderHook(() => usePayloadTelemetry());
    await vi.advanceTimersByTimeAsync(120);
    expect(invokeMock).toHaveBeenCalledWith("get_latest_telemetry", { storeName: "payload", fieldName: "joystick_x" });
    expect(invokeMock).toHaveBeenCalledWith("get_latest_telemetry", { storeName: "payload", fieldName: "joystick_y" });
  });
});
