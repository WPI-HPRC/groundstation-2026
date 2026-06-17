import logo from "../Resources/HPRC-Logo-and-Text.svg";
import ArcGauge from "../Components/ArcGauge";
import { MaxStats } from "../Components/MaxStats";
import { RocketViewer } from "../Components/RocketViewer";
import { useMainGuiTelemetry } from "../main-gui/useMainGuiTelemetry";

export function BottomOverlayWindow() {
  const { speedFtS, altitudeFt, gForce, quaternion, flightSession } = useMainGuiTelemetry();

  return (
    <main className="obs-window obs-bottom-window" aria-label="Bottom telemetry overlay">
      <div className="container-secondary" id="gauges-container">
        <MaxStats
          data={{ speed: speedFtS, altitude: altitudeFt, gForce }}
          speedUnits="ft/s"
          resetKey={flightSession}
        />
        <RocketViewer quaternion={quaternion} />
        <div className="container-secondary" id="title-container">
          <div className="logo-container">
            <p id="title-primary">WPI</p>
            <img src={logo} id="logo-img" alt="HPRC" />
          </div>
        </div>
        <ArcGauge
          value={Math.round(speedFtS)}
          min={0}
          max={1700}
          units="FT/S"
          label="SPEED"
        />
        <ArcGauge
          value={Number(gForce.toFixed(1))}
          min={0}
          max={2}
          units="&nbsp;"
          label="G-FORCE"
        />
      </div>
    </main>
  );
}
