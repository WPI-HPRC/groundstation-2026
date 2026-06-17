import { useEffect, useState, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { rgbBase64ToImageData } from "./decodeFrame";
import { FrameBuffer } from "./FrameBuffer";

const STREAM = "payload";
const POLL_MS = 16;     // poll faster than we render
const RENDER_MS = 33;   // ~30 fps display
const BUFFER_FRAMES = 3;

type VideoFrameDto = { timestamp: number; data_base64: string; width: number; height: number };

export interface VideoSize {
  width: number;
  height: number;
}

/** Polls the payload video stream, buffers frames, and renders them to `canvasRef`. */
export function usePayloadVideo(canvasRef: RefObject<HTMLCanvasElement | null>): VideoSize | null {
  const [size, setSize] = useState<VideoSize | null>(null);

  useEffect(() => {
    const buffer = new FrameBuffer(BUFFER_FRAMES);
    let lastTs: number | null = null;
    let stopped = false;
    let pollInFlight = false;

    const pollOnce = async () => {
      if (pollInFlight || stopped) return;
      pollInFlight = true;
      try {
        const dto = await invoke<VideoFrameDto | null>("get_latest_video_frame", { streamName: STREAM });
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
          /* malformed frame — skip without breaking the poll loop */
        }
      } catch {
        /* no payload video available yet — hold */
      } finally {
        pollInFlight = false;
      }
    };

    const poll = window.setInterval(() => void pollOnce(), POLL_MS);

    const render = window.setInterval(() => {
      const frame = buffer.next();
      const canvas = canvasRef.current;
      if (!frame || !canvas) return;
      if (canvas.width !== frame.image.width) canvas.width = frame.image.width;
      if (canvas.height !== frame.image.height) canvas.height = frame.image.height;
      canvas.getContext("2d")?.putImageData(frame.image, 0, 0);
    }, RENDER_MS);

    return () => {
      stopped = true;
      window.clearInterval(poll);
      window.clearInterval(render);
    };
  }, [canvasRef]);

  return size;
}
