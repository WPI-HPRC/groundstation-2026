import { useEffect, useState } from "react";
import type { TelemetrySnapshot } from "../../telemetry/useTelemetry";
import { FlightMap3D, type LocalPoint } from "../../../trajectory-viz";
import { LAUNCH_ORIGIN } from "../../config";

interface MapTabProps {
  snap: TelemetrySnapshot;
  flags?: Record<string, boolean>;
  isActive?: boolean;
}

// Keep the whole flight path on the map. (The telemetry ring buffer only keeps
// a short chart window, so we accumulate samples here instead of reading it.)
const MAP_PATH_MAX = 20000;

interface PathState {
  pts: LocalPoint[];
  lastTs: number | null;
}

export function MapTab({ snap }: MapTabProps) {
  const [follow, setFollow] = useState(true);

  // Accumulate the full path by appending each newest sample as it arrives.
  // The reducer is pure (keyed on the sample timestamp) so it's idempotent and
  // StrictMode-safe — re-running it for the same frame is a no-op.
  const [path, setPath] = useState<PathState>({ pts: [], lastTs: null });
  const latest = snap.latest;

  useEffect(() => {
    if (!latest) return;
    setPath((prev) => {
      if (prev.lastTs === latest.timestamp) return prev;
      // Timestamp going backwards means a new flight/session — start fresh.
      const base =
        prev.lastTs !== null && latest.timestamp < prev.lastTs ? [] : prev.pts;
      const p = latest.positionLocal;
      const next = base.concat({ x: p.x, y: p.y, z: p.z });
      if (next.length > MAP_PATH_MAX) next.splice(0, next.length - MAP_PATH_MAX);
      return { pts: next, lastTs: latest.timestamp };
    });
  }, [latest]);

  const points = path.pts;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <FlightMap3D
          trajectory={{ mode: "enu", points, origin: LAUNCH_ORIGIN }}
          follow={follow}
          rasterTilesUrl="/tiles/{z}/{x}/{y}.jpg"
          rasterMaxZoom={16}
          rasterAttribution="Imagery © Esri, Maxar, Earthstar Geographics"
        />
        <button
          type="button"
          onClick={() => setFollow((f) => !f)}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 3,
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.35)",
            background: follow ? "var(--accent-color, #af283a)" : "rgba(0,0,0,0.45)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {follow ? "Following" : "Follow Camera"}
        </button>
      </div>

      <footer
        style={{
          display: "flex",
          gap: 24,
          padding: "8px 16px",
          borderTop: "1px solid var(--bg-color-secondary, #3e3e3e)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <Stat label="Max Vel" value={`${snap.maxVel.toFixed(1)} m/s`} />
        <Stat label="Max Accel" value={`${snap.maxAccel.toFixed(1)} m/s²`} />
        <Stat label="Apogee" value={`${apogee(points).toFixed(0)} m`} />
        <Stat label="Samples" value={String(points.length)} />
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
      <span style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <span style={{ fontSize: 16, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function apogee(points: LocalPoint[]): number {
  let max = 0;
  for (let i = 0; i < points.length; i++) if (points[i].z > max) max = points[i].z;
  return max;
}
