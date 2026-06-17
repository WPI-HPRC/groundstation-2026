import { useState } from "react";

const MJPEG_PORT = 17777;

export function MainVideoCanvas({
  streamName,
  className = "video-layer",
  label = "Live video",
}: {
  streamName: string;
  className?: string;
  label?: string;
}) {
  const [hasVideo, setHasVideo] = useState(false);
  const src = `http://127.0.0.1:${MJPEG_PORT}/video/${encodeURIComponent(streamName)}.mjpg`;

  return (
    <div className={className} aria-label={label}>
      <img
        key={streamName}
        src={src}
        className="video-canvas"
        alt=""
        onLoad={() => setHasVideo(true)}
        onError={() => setHasVideo(false)}
      />
      {!hasVideo ? (
        <div className="no-video-placeholder">
          <span>NO SIGNAL</span>
        </div>
      ) : null}
    </div>
  );
}
