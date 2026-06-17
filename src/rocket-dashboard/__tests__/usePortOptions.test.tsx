import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useSerialPorts, useVideoDevices } from "../components/sidebar/usePortOptions";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

describe("usePortOptions", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    // Real Tauri invoke reads window.__TAURI_INTERNALS__; ensure tests start clean.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__TAURI_INTERNALS__;
  });

  it("useSerialPorts loads serial port names", async () => {
    invokeMock.mockResolvedValue(["COM1", "COM3"]);
    const { result } = renderHook(() => useSerialPorts());
    await waitFor(() => expect(result.current.options).toEqual(["COM1", "COM3"]));
    expect(invokeMock).toHaveBeenCalledWith("get_serial_port_names");
  });

  it("useVideoDevices loads video devices", async () => {
    invokeMock.mockResolvedValue(["0: FaceTime", "1: USB Cam"]);
    const { result } = renderHook(() => useVideoDevices());
    await waitFor(() => expect(result.current.options).toEqual(["0: FaceTime", "1: USB Cam"]));
    expect(invokeMock).toHaveBeenCalledWith("list_video_devices");
  });

  it("sets error and empty options when invoke rejects", async () => {
    invokeMock.mockImplementation(async () => {
      throw new Error("no tauri");
    });
    const { result } = renderHook(() => useSerialPorts());
    await waitFor(() => expect(result.current.error).toBe("ports unavailable"));
    expect(result.current.options).toEqual([]);
  });
});
