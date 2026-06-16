import { useState } from "react";
import "./theme.css";

type TabKey = "graphs" | "map";

export function RocketDashboardApp() {
  const [tab, setTab] = useState<TabKey>("graphs");

  return (
    <div className="dash-root">
      <aside className="dash-sidebar">
        <div style={{ fontWeight: 700 }}>SIDEBAR (placeholder)</div>
      </aside>
      <main className="dash-main">
        <div className="dash-tabbar">
          <button
            className={`dash-tab ${tab === "graphs" ? "active" : ""}`}
            onClick={() => setTab("graphs")}
          >
            Graphs
          </button>
          <button
            className={`dash-tab ${tab === "map" ? "active" : ""}`}
            onClick={() => setTab("map")}
          >
            Map
          </button>
        </div>
        <div className="dash-tab-body">
          {tab === "graphs" ? "GRAPHS (placeholder)" : "MAP (placeholder)"}
        </div>
      </main>
    </div>
  );
}
