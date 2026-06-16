import type { TelemetryFrame } from "../../telemetry/types";
import { VELOCITY_MAX, VELOCITY_MIN } from "../../config";
import { PortSelector } from "./PortSelector";
import { StatePanel } from "./StatePanel";
import { FlagToggles } from "./FlagToggles";
import { VoltageReadout } from "./VoltageReadout";
import { RocketViewer } from "../../../Components/RocketViewer";
import ArcGauge from "../../../Components/ArcGauge";

const IDENTITY = { w: 1, i: 0, j: 0, k: 0 };

export function Sidebar({
  latest,
  droppedFrames,
}: {
  latest: TelemetryFrame | null;
  droppedFrames?: number;
}) {
  const q = latest?.orientation ?? IDENTITY;
  const vel = latest?.velocity ?? 0;

  return (
    <aside className="dash-sidebar">
      {/* COM-port selector sits ABOVE the state panel (per wireframe). */}
      <PortSelector />
      <div
        style={{
          border: "1px solid var(--bg-color-secondary)",
          borderRadius: 6,
          padding: "8px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: 1.2, color: "var(--fg-color-secondary)" }}>ERRORS</div>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{droppedFrames ?? 0}</div>
      </div>
      <StatePanel state={latest?.state ?? null} />
      <FlagToggles />
      <div
        style={{
          background: "rgba(208, 28, 52, 0.49)", // var(--accent-color) with 15% opacity
     
          border: "1px solid var(--accent-color)",
     
          borderRadius: 12,
          padding: 10,
          display: "grid",
          gridTemplateRows: "1fr 1fr",
          gap: 10,
          width: "100%",
          height: "100%"
        }}
      >
        <div style={{ width: "100%", height: "100%" }}>
          <RocketViewer quaternion={{ x: q.i, y: q.j, z: q.k, w: q.w }} />
        </div>
        <div style={{ width: "100%", height: "100%" }}>
          <ArcGauge value={Math.round(vel)} min={VELOCITY_MIN} max={VELOCITY_MAX} units="m/s" label="VELOCITY" />
        </div>
      </div>
      <VoltageReadout voltage={latest?.voltage ?? null} />
    </aside>
  );
}
