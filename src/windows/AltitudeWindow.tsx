import ProgressBar from "../Components/ProgressBar";
import { useMainGuiTelemetry } from "../main-gui/useMainGuiTelemetry";

export function AltitudeWindow() {
  const { altitudeProgress } = useMainGuiTelemetry();

  return (
    <main className="obs-window obs-altitude-window" aria-label="Altitude bar">
      <ProgressBar
        title="Altitude (AGL)"
        secondary="UNOFFICIAL"
        ticknames={["0 ft", "10 kft", "20 kft", "30 kft"]}
        tickvalues={[0, 0.333, 0.667, 1.0]}
        progress={altitudeProgress}
        thickness="8px"
      />
    </main>
  );
}
