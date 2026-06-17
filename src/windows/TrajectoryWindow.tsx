import { TrajectoryViewer } from "../Components/TrajectoryViewer";
import { useMainGuiTelemetry } from "../main-gui/useMainGuiTelemetry";

export function TrajectoryWindow() {
  const { trajectoryPoints } = useMainGuiTelemetry();

  return (
    <main className="obs-window obs-trajectory-window" aria-label="Trajectory display">
      <TrajectoryViewer points={trajectoryPoints} />
    </main>
  );
}
