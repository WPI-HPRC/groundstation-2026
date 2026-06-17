import { useEffect, useState, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";

const DEFAULT_POLL_MS = 33;

type VideoFrameDto = { timestamp: number; jpeg_base64: string; width: number; height: number };

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
    let lastTs: number | null = null;
    let stopped = false;
    let pollInFlight = false;
    let imageLoadSerial = 0;

    const pollOnce = async () => {
      if (pollInFlight || stopped) return;
      pollInFlight = true;
      try {
        const dto = await invoke<VideoFrameDto | null>("get_latest_video_frame_jpeg", { streamName });
        if (!dto || stopped) return;
        if (lastTs !== null && dto.timestamp <= lastTs) return;
        lastTs = dto.timestamp;
        const loadSerial = ++imageLoadSerial;
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          if (stopped || loadSerial !== imageLoadSerial) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          if (canvas.width !== dto.width) canvas.width = dto.width;
          if (canvas.height !== dto.height) canvas.height = dto.height;
          canvas.getContext("2d")?.drawImage(img, 0, 0, dto.width, dto.height);
          setSize((prev) =>
            prev && prev.width === dto.width && prev.height === dto.height
              ? prev
              : { width: dto.width, height: dto.height }
          );
        };
        img.src = `data:image/jpeg;base64,${dto.jpeg_base64}`;
      } catch {
        /* stream not available yet - hold the previous frame */
      } finally {
        pollInFlight = false;
      }
    };

    void pollOnce();
    const poll = window.setInterval(() => void pollOnce(), pollMs);

    return () => {
      stopped = true;
      window.clearInterval(poll);
    };
  }, [canvasRef, options.pollMs, streamName]);

  return size;
}
