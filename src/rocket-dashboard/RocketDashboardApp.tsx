import { useMemo, useState } from "react";
import "./theme.css";
import { createTelemetrySource } from "./telemetry/createTelemetrySource";
import { useTelemetry } from "./telemetry/useTelemetry";
import { Sidebar } from "./components/sidebar/Sidebar";
import { GraphsTab } from "./components/tabs/GraphsTab";
import { MapTab } from "./components/tabs/MapTab";

type TabKey = "graphs" | "map";

export function RocketDashboardApp() {
  const [tab, setTab] = useState<TabKey>("graphs");

  // The source is created once and lives for the app's lifetime.
  const source = useMemo(() => createTelemetrySource(), []);
  const snap = useTelemetry(source);

  return (
    <div className="dash-root">
      <Sidebar
        latest={snap.latest}
        droppedFrames={snap.droppedFrames}
        missingFirstFrameFields={snap.missingFirstFrameFields}
        emittedFrames={snap.emittedFrames}
      />
      <main className="dash-main">
        <div className="dash-tabbar">
          <button className={`dash-tab ${tab === "graphs" ? "active" : ""}`} onClick={() => setTab("graphs")}>
            Graphs
          </button>
          <button className={`dash-tab ${tab === "map" ? "active" : ""}`} onClick={() => setTab("map")}>
            Map
          </button>
        </div>
        <div className="dash-tab-body">
          {/* Keep BOTH mounted; hide inactive so history + map state survive tab switches. */}
          <div style={{ height: "100%", display: tab === "graphs" ? "block" : "none" }}>
            <GraphsTab snap={snap} isActive={tab === "graphs"} />
          </div>
          <div style={{ height: "100%", display: tab === "map" ? "block" : "none" }}>
            <MapTab snap={snap} isActive={tab === "map"} />
          </div>
        </div>
      </main>
    </div>
  );
}
