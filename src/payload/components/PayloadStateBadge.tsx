import type { FlightState } from "../../rocket-dashboard/telemetry/types";

export function PayloadStateBadge({ state }: { state: FlightState | null }) {
  return (
    <div className="payload-panel" style={{ right: 24, bottom: 24, textAlign: "right" }}>
      <div className="payload-panel-label">PAYLOAD STATE</div>
      <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, textShadow: "0 1px 6px rgba(0,0,0,.7)" }}>
        {state ?? "—"}
      </div>
    </div>
  );
}
