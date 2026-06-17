import { useRef } from "react";
import { useTauriVideoStream } from "../video/useTauriVideoStream";

const LIVE_VIDEO_STREAM = "live_vide";

export function MainVideoCanvas() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useTauriVideoStream(LIVE_VIDEO_STREAM, ref);

  return <canvas ref={ref} className="video-layer" aria-label="Live rocket video" />;
}
