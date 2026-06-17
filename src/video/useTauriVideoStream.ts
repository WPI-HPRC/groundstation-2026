import { useEffect, useState, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { rgbBase64ToImageData } from "../payload/video/decodeFrame";
import { FrameBuffer } from "../payload/video/FrameBuffer";

const DEFAULT_POLL_MS = 33;
const DEFAULT_RENDER_MS = 33;
const DEFAULT_BUFFER_FRAMES = 1;

type VideoFrameDto = { timestamp: number; data_base64: string; width: number; height: number };

export interface VideoSize {
  width: number;
  height: number;
}

export interface TauriVideoStreamOptions {
  pollMs?: number;
  renderMs?: number;
  bufferFrames?: number;
}

/** Polls a Tauri video stream, buffers frames, and renders them to `canvasRef`. */
export function useTauriVideoStream(
  streamName: string,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: TauriVideoStreamOptions = {}
): VideoSize | null {
  const [size, setSize] = useState<VideoSize | null>(null);

  useEffect(() => {
    const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
    const renderMs = options.renderMs ?? DEFAULT_RENDER_MS;
    const bufferFrames = options.bufferFrames ?? DEFAULT_BUFFER_FRAMES;
    const buffer = new FrameBuffer(bufferFrames);
    let lastTs: number | null = null;
    let stopped = false;
    let pollInFlight = false;

    const pollOnce = async () => {
      if (pollInFlight || stopped) return;
      pollInFlight = true;
      try {
        const dto = await invoke<VideoFrameDto | null>("get_latest_video_frame", { streamName });
        if (!dto || stopped) return;
        if (lastTs !== null && dto.timestamp <= lastTs) return;
        try {
          const image = rgbBase64ToImageData(dto.data_base64, dto.width, dto.height);
          lastTs = dto.timestamp;
          buffer.push({ timestamp: dto.timestamp, image });
          setSize((prev) =>
            prev && prev.width === dto.width && prev.height === dto.height
              ? prev
              : { width: dto.width, height: dto.height }
          );
        } catch {
          /* malformed frame - skip without breaking the poll loop */
        }
      } catch {
        /* stream not available yet - hold the previous frame */
      } finally {
        pollInFlight = false;
      }
    };

    void pollOnce();
    const poll = window.setInterval(() => void pollOnce(), pollMs);
    const render = window.setInterval(() => {
      const frame = buffer.next();
      const canvas = canvasRef.current;
      if (!frame || !canvas) return;
      if (canvas.width !== frame.image.width) canvas.width = frame.image.width;
      if (canvas.height !== frame.image.height) canvas.height = frame.image.height;
      canvas.getContext("2d")?.putImageData(frame.image, 0, 0);
    }, renderMs);

    return () => {
      stopped = true;
      window.clearInterval(poll);
      window.clearInterval(render);
    };
  }, [canvasRef, options.bufferFrames, options.pollMs, options.renderMs, streamName]);

  return size;
}
