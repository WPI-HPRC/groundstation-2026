import type { TelemetryFrame } from "../../telemetry/types";
import { VELOCITY_MAX, VELOCITY_MIN } from "../../config";
import { PortSelector } from "./PortSelector";
import { StatePanel } from "./StatePanel";
import { FlagToggles } from "./FlagToggles";
import { OrientationIndicator } from "./OrientationIndicator";
import { VelocityDial } from "./VelocityDial";
import { VoltageReadout } from "./VoltageReadout";

const IDENTITY = { w: 1, i: 0, j: 0, k: 0 };

export function Sidebar({
  latest,
}: {
  latest: TelemetryFrame | null;
}) {
  return (
    <aside className="dash-sidebar">
      {/* COM-port selector sits ABOVE the state panel (per wireframe). */}
      <PortSelector />
      <StatePanel state={latest?.state ?? null} />
      <FlagToggles />
      <OrientationIndicator orientation={latest?.orientation ?? IDENTITY} />
      <VelocityDial value={latest?.velocity ?? 0} min={VELOCITY_MIN} max={VELOCITY_MAX} />
      <VoltageReadout voltage={latest?.voltage ?? null} />
    </aside>
  );
}
