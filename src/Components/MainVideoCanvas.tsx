import { useRef } from "react";
import { useTauriVideoStream, type TauriVideoStreamOptions } from "../video/useTauriVideoStream";

export function MainVideoCanvas({
  streamName,
  className = "video-layer",
  label = "Live video",
  videoOptions = { pollMs: 33, renderMs: 33, bufferFrames: 1 },
}: {
  streamName: string;
  className?: string;
  label?: string;
  videoOptions?: TauriVideoStreamOptions;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const size = useTauriVideoStream(streamName, ref, videoOptions);

  return (
    <div className={className} aria-label={label}>
      <canvas ref={ref} className="video-canvas" />
      {!size ? (
        <div className="no-video-placeholder">
          <span>NO SIGNAL</span>
        </div>
      ) : null}
    </div>
  );
}
