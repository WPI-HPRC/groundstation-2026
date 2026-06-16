import type { TelemetrySnapshot } from "../../telemetry/useTelemetry";
export function GraphsTab({ snap }: { snap: TelemetrySnapshot; isActive?: boolean }) {
  return <div style={{ padding: 16 }}>Graphs tab — samples: {snap.history.t.length}</div>;
}
