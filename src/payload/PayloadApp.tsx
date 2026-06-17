import { useState } from "react";
import "./PayloadApp.css";
import logo from "../Resources/HPRC-Logo-and-Text.svg";
import { PayloadVideoCanvas } from "./video/PayloadVideoCanvas";
import { VisionOverlay } from "./components/VisionOverlay";
import { JoystickMonitor } from "./components/JoystickMonitor";
import { PayloadStateBadge } from "./components/PayloadStateBadge";
import { usePayloadTelemetry } from "./telemetry/usePayloadTelemetry";

export function PayloadApp() {
  const telem = usePayloadTelemetry();
  const [size, setSize] = useState({ width: 1280, height: 800 });

  return (
    <main className="payload-container">
      <PayloadVideoCanvas onSize={(w, h) => setSize((p) => (p.width === w && p.height === h ? p : { width: w, height: h }))} />
      <VisionOverlay width={size.width} height={size.height} horizon={telem.horizon} blobs={telem.blobs} />

      <div className="payload-panel" style={{ top: 18, left: 18, padding: ".35rem .8rem", borderRadius: 999 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".16em" }}>● PAYLOAD CAM</span>
      </div>

      <JoystickMonitor x={telem.joystickX} y={telem.joystickY} />
      <PayloadStateBadge state={telem.state} />

      <div className="payload-logo">
        <img src={logo} alt="WPI HPRC" />
      </div>
    </main>
  );
}
