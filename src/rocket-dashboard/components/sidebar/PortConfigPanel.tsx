import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PortSelect } from "./PortSelect";
import { useSerialPorts } from "./usePortOptions";

export function PortConfigPanel() {
  const serial = useSerialPorts();
  const [spoofStatus, setSpoofStatus] = useState<string | null>(null);

  const spoofRocketFrame = async () => {
    try {
      await invoke("spoof_rocket_telemetry_once");
      setSpoofStatus("spoofed rocket frame");
    } catch {
      setSpoofStatus("could not spoof rocket frame");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <PortSelect
        label="Telem radio"
        options={serial.options}
        error={serial.error}
        onRefresh={serial.refresh}
        setCommand="set_telem_serial_port"
        argName="portName"
      />
      <PortSelect
        label="Tracker serial"
        options={serial.options}
        error={serial.error}
        onRefresh={serial.refresh}
        setCommand="set_tracker_serial_port"
        argName="portName"
      />
      <PortSelect
        label="Pointing serial"
        options={serial.options}
        error={serial.error}
        onRefresh={serial.refresh}
        setCommand="set_pointing_serial_port"
        argName="portName"
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 12, letterSpacing: 1.2, color: "var(--fg-color-secondary)" }}>Debug telemetry</div>
        <button
          onClick={() => void spoofRocketFrame()}
          style={{
            background: "var(--bg-color-secondary)",
            color: "var(--fg-color)",
            border: "none",
            borderRadius: 4,
            padding: "7px 10px",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          Spoof Rocket Frame
        </button>
        {spoofStatus ? (
          <div style={{ fontSize: 12, color: "var(--fg-color-secondary)" }}>{spoofStatus}</div>
        ) : null}
      </div>
    </div>
  );
}
