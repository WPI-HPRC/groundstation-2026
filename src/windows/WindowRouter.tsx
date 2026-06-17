import { AltitudeWindow } from "./AltitudeWindow";
import { BottomOverlayWindow } from "./BottomOverlayWindow";
import { TrajectoryWindow } from "./TrajectoryWindow";

export type ObsWindowView = "main-bottom" | "altitude-bar" | "trajectory";

function getWindowView(): ObsWindowView {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  if (view === "altitude-bar" || view === "trajectory" || view === "main-bottom") {
    return view;
  }

  return "main-bottom";
}

export function WindowRouter() {
  const view = getWindowView();

  if (view === "altitude-bar") return <AltitudeWindow />;
  if (view === "trajectory") return <TrajectoryWindow />;
  return <BottomOverlayWindow />;
}
