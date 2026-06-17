import "./JoystickMonitor.css";
import { joystickToKnob } from "../telemetry/payloadFields";

function fmt(label: string, v: number): string {
  const s = v.toFixed(2);
  return v < 0 ? `${label} −${Math.abs(v).toFixed(2)}` : `${label} +${s}`;
}

export function JoystickMonitor({ x, y }: { x: number; y: number }) {
  const knob = joystickToKnob(x, y);
  return (
    <div className="payload-panel" style={{ left: 24, bottom: 24, width: 170 }}>
      <div className="payload-panel-label">JOYSTICK</div>
      <div className="joystick-dial">
        <div className="joystick-knob" style={{ left: `${knob.left * 100}%`, top: `${knob.top * 100}%` }} />
      </div>
      <div className="joystick-readout">
        <span>{fmt("X", x)}</span>
        <span>{fmt("Y", y)}</span>
      </div>
    </div>
  );
}
