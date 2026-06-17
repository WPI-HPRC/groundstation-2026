import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const invokeMock = vi.fn();
const decodeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
vi.mock("../video/decodeFrame", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../video/decodeFrame")>();
  return { ...actual, rgbBase64ToImageData: (...a: Parameters<typeof actual.rgbBase64ToImageData>) => decodeMock(...a) };
});

import { usePayloadVideo } from "../video/usePayloadVideo";

const FRAME = { timestamp: 1, data_base64: "abc", width: 2, height: 1 };
const IMAGE = { width: 2, height: 1, data: new Uint8ClampedArray(8) } as ImageData;

describe("usePayloadVideo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset();
    decodeMock.mockReset();
    decodeMock.mockReturnValue(IMAGE);
  });
  afterEach(() => vi.useRealTimers());

  it("polls get_latest_video_frame for the payload stream", async () => {
    invokeMock.mockResolvedValue(null);
    const canvasRef = { current: document.createElement("canvas") };
    renderHook(() => usePayloadVideo(canvasRef));
    await vi.advanceTimersByTimeAsync(60);
    expect(invokeMock).toHaveBeenCalledWith("get_latest_video_frame", { streamName: "payload" });
  });

  it("rejects stale and out-of-order timestamps", async () => {
    invokeMock
      .mockResolvedValueOnce({ ...FRAME, timestamp: 100 })
      .mockResolvedValueOnce({ ...FRAME, timestamp: 50 })
      .mockResolvedValueOnce({ ...FRAME, timestamp: 150 });
    const canvasRef = { current: document.createElement("canvas") };
    renderHook(() => usePayloadVideo(canvasRef));
    await vi.advanceTimersByTimeAsync(80);
    expect(decodeMock).toHaveBeenCalledTimes(2);
  });

  it("skips malformed frames without stopping the poll loop", async () => {
    invokeMock
      .mockResolvedValueOnce({ ...FRAME, timestamp: 1 })
      .mockResolvedValueOnce({ ...FRAME, timestamp: 2 });
    decodeMock.mockImplementationOnce(() => { throw new Error("bad frame"); });
    decodeMock.mockImplementationOnce(() => IMAGE);
    const canvasRef = { current: document.createElement("canvas") };
    const { result } = renderHook(() => usePayloadVideo(canvasRef));
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    expect(decodeMock).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ width: 2, height: 1 });
  });

  it("does not overlap poll requests while one is in flight", async () => {
    let resolvePoll: (v: unknown) => void = () => {};
    invokeMock.mockImplementation(
      () => new Promise((r) => { resolvePoll = r; }),
    );
    const canvasRef = { current: document.createElement("canvas") };
    renderHook(() => usePayloadVideo(canvasRef));
    await vi.advanceTimersByTimeAsync(20);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(40);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    resolvePoll(null);
    await vi.advanceTimersByTimeAsync(20);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
