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

  it("does not overlap telemetry polls while one is in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    invokeMock.mockImplementation(() => gate.then(() => ({ timestamp: 1, value: "0" })));

    renderHook(() => usePayloadTelemetry());
    await vi.advanceTimersByTimeAsync(10);
    const callsWhileBlocked = invokeMock.mock.calls.length;
    expect(callsWhileBlocked).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(100);
    expect(invokeMock.mock.calls.length).toBe(callsWhileBlocked);

    release();
    await vi.advanceTimersByTimeAsync(60);
    expect(invokeMock.mock.calls.length).toBeGreaterThan(callsWhileBlocked);
  });

  it("preserves snapshot reference when telemetry is unchanged", async () => {
    invokeMock.mockResolvedValue({ timestamp: 1, value: "0.25" });
    const { result } = renderHook(() => usePayloadTelemetry());
    await vi.advanceTimersByTimeAsync(120);
    const first = result.current;
    await vi.advanceTimersByTimeAsync(120);
    expect(result.current).toBe(first);
  });
});
