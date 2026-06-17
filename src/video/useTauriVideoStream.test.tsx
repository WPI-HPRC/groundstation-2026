import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { useTauriVideoStream } from "./useTauriVideoStream";

describe("useTauriVideoStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the configured poll interval instead of polling at 60fps", async () => {
    const canvasRef = { current: document.createElement("canvas") };
    renderHook(() => useTauriVideoStream("live_vide", canvasRef, { pollMs: 33, renderMs: 33, bufferFrames: 1 }));

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenLastCalledWith("get_latest_video_frame_jpeg", { streamName: "live_vide" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32);
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
