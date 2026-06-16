import React, { Suspense, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import type { LocalPoint } from "./index";

const FlightMap3D = React.lazy(() =>
  import("./FlightMap3D").then((m) => ({ default: m.FlightMap3D }))
);

// Demo origin only — the real dashboard passes its own LAUNCH_ORIGIN.
const DEMO_ORIGIN = { lat: 31.031080142681898, lon: -103.5400953745281, alt: 0 };

function useSamplePath(): LocalPoint[] {
  const [pts, setPts] = useState<LocalPoint[]>([]);
  useEffect(() => {
    // A clean lofted arc: flies ~2.4 km downrange (East), drifts slightly
    // North, peaks at ~800 m apogee (z = 80t - 2t²), and lands near t = 40.
    let t = 0;
    const id = setInterval(() => {
      t += 0.1;
      setPts((prev) => {
        const next = prev.slice(-800);
        next.push({
          x: 60 * t,
          y: 8 * t,
          z: Math.max(0, 80 * t - 2 * t * t),
        });
        return next;
      });
      if (t > 40) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, []);
  return pts;
}

function Demo() {
  const points = useSamplePath();
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Suspense
        fallback={
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#c1c1c1",
              background: "#0b1d2a",
              fontFamily: "system-ui, sans-serif",
              fontWeight: 600,
            }}
          >
            Loading 3D trajectory…
          </div>
        }
      >
        <FlightMap3D
          trajectory={{ mode: "enu", points, origin: DEMO_ORIGIN }}
          follow
          rasterTilesUrl="/tiles/{z}/{x}/{y}.jpg"
          rasterMaxZoom={16}
          rasterAttribution="Imagery © Esri, Maxar, Earthstar Geographics"
        />
      </Suspense>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Demo />
  </React.StrictMode>
);
