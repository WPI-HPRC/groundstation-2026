import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { usePayloadVideo } from "../video/usePayloadVideo";

describe("usePayloadVideo", () => {
  beforeEach(() => { vi.useFakeTimers(); invokeMock.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it("polls get_latest_video_frame for the payload stream", async () => {
    invokeMock.mockResolvedValue(null);
    const canvasRef = { current: document.createElement("canvas") };
    renderHook(() => usePayloadVideo(canvasRef));
    await vi.advanceTimersByTimeAsync(60);
    expect(invokeMock).toHaveBeenCalledWith("get_latest_video_frame", { streamName: "payload" });
  });
});
