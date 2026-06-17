import { MainVideoCanvas } from "./MainVideoCanvas";
import "./SplitView.css";

export type SplitViewChoice = "live" | "tracking";

export default function SplitView({ onSelect }: { onSelect: (choice: SplitViewChoice) => void }) {
  return (
    <div className="split-view-container" role="dialog" aria-label="Select video view">
      <div className="split-view-title">Select View</div>
      <div className="split-view-images-container">
        <button
          type="button"
          className="split-view-option"
          id="live-video-img"
          onClick={() => onSelect("live")}
        >
          <MainVideoCanvas
            streamName="live_vide"
            className="split-view-image"
            label="Live video preview"
          />
          <span className="split-view-label">Live Video</span>
        </button>
        <button
          type="button"
          className="split-view-option"
          id="ground-tracking-img"
          onClick={() => onSelect("tracking")}
        >
          <MainVideoCanvas
            streamName="tracking"
            className="split-view-image"
            label="Ground tracking preview"
          />
          <span className="split-view-label">Ground Tracking</span>
        </button>
      </div>
    </div>
  );
}