import type { TelemetryFrame } from "../../telemetry/types";
import { VELOCITY_MAX, VELOCITY_MIN } from "../../config";
import { PortConfigPanel } from "./PortConfigPanel";
import { StatePanel } from "./StatePanel";
import { FlagToggles } from "./FlagToggles";
import { VoltageReadout } from "./VoltageReadout";
import { RocketViewer } from "../../../Components/RocketViewer";
import ArcGauge from "../../../Components/ArcGauge";

const IDENTITY = { w: 1, i: 0, j: 0, k: 0 };

export function Sidebar({
  latest,
  droppedFrames,
  missingFirstFrameFields = [],
  emittedFrames = 0,
}: {
  latest: TelemetryFrame | null;
  droppedFrames?: number;
  missingFirstFrameFields?: string[];
  emittedFrames?: number;
}) {
  const q = latest?.orientation ?? IDENTITY;
  const vel = latest?.velocity ?? 0;
  const isWaitingForFirstFrame = latest == null && missingFirstFrameFields.length > 0;

  return (
    <aside className="dash-sidebar">
      {/* Per-interface port configuration. */}
      <PortConfigPanel />
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
      <div
        style={{
          border: "1px solid var(--bg-color-secondary)",
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 12,
          lineHeight: 1.35,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ letterSpacing: 1.2, color: "var(--fg-color-secondary)" }}>TAURI SOURCE</div>
          <div style={{ fontWeight: 800 }}>{latest ? "LIVE" : "WAITING"}</div>
        </div>
        <div style={{ color: "var(--fg-color-secondary)", marginTop: 4 }}>Frames emitted: {emittedFrames}</div>
        {isWaitingForFirstFrame ? (
          <div style={{ marginTop: 6 }}>
            <div style={{ color: "var(--accent-color)", fontWeight: 800 }}>Missing first-frame fields:</div>
            <div style={{ color: "var(--fg-color-secondary)", wordBreak: "break-word" }}>
              {missingFirstFrameFields.join(", ")}
            </div>
          </div>
        ) : null}
      </div>
      <StatePanel state={latest?.state ?? null} />
      <FlagToggles />
      <div className="dash-attitude-card">
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
