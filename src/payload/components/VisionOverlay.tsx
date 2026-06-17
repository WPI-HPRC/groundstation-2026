import type { Blob } from "../telemetry/payloadFields";
import type { Horizon } from "../telemetry/usePayloadTelemetry";

/** SVG overlay in video-pixel coordinate space; CSS stretches it over the canvas. */
export function VisionOverlay({
  width,
  height,
  horizon,
  blobs,
}: {
  width: number;
  height: number;
  horizon: Horizon | null;
  blobs: Blob[];
}) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: "none" }}
    >
      {horizon?.valid && (
        <line
          x1={horizon.x1}
          y1={horizon.y1}
          x2={horizon.x2}
          y2={horizon.y2}
          stroke="var(--accent-color)"
          strokeWidth={2}
          strokeDasharray="10 6"
        />
      )}
      {blobs.map((b) => (
        <g key={b.index} stroke="#37d27a" fill="none" strokeWidth={2}>
          <ellipse cx={b.x} cy={b.y} rx={b.a || 6} ry={b.b || 6} transform={`rotate(${b.rotation} ${b.x} ${b.y})`} />
          <circle cx={b.x} cy={b.y} r={3} fill="#37d27a" stroke="none" />
          <text x={b.x} y={b.y - (b.b || 6) - 6} fill="#9bf0c2" fontSize={13} fontFamily="ui-monospace, monospace" stroke="none">
            {b.confidence.toFixed(2)}
          </text>
        </g>
      ))}
    </svg>
  );
}
