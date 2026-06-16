import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { FlightMap3D, type LocalPoint } from "./index";

// Demo origin only — the real dashboard passes its own LAUNCH_ORIGIN.
const DEMO_ORIGIN = { lat: 31.031080142681898, lon: -103.5400953745281, alt: 0 };

function useSamplePath(): LocalPoint[] {
  const [pts, setPts] = useState<LocalPoint[]>([]);
  useEffect(() => {
    let t = 0;
    const id = setInterval(() => {
      t += 0.1;
      setPts((prev) => {
        const next = prev.slice(-600);
        next.push({
          x: t * 4 + Math.sin(t) * 20,
          y: t * 2.5 + Math.cos(t) * 20,
          z: Math.max(0, 300 * t - 2 * t * t),
        });
        return next;
      });
      if (t > 60) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, []);
  return pts;
}

function Demo() {
  const points = useSamplePath();
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <FlightMap3D trajectory={{ mode: "enu", points, origin: DEMO_ORIGIN }} follow />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Demo />
  </React.StrictMode>
);
