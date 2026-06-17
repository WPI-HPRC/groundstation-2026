import { useRef } from "react";
import { usePayloadVideo } from "./usePayloadVideo";

/** Full-bleed payload camera canvas. `onSize` reports natural video dimensions for overlay sizing. */
export function PayloadVideoCanvas({ onSize }: { onSize?: (w: number, h: number) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const size = usePayloadVideo(ref);
  if (size && onSize) onSize(size.width, size.height);
  return (
    <canvas
      ref={ref}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        zIndex: 0,
        background: "#000",
      }}
    />
  );
}
