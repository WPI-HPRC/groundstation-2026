import type { TelemetrySnapshot } from "../../telemetry/useTelemetry";
export function MapTab({ snap }: { snap: TelemetrySnapshot; flags?: Record<string, boolean>; isActive?: boolean }) {
  return <div style={{ padding: 16 }}>Map tab — samples: {snap.history.t.length}</div>;
}
