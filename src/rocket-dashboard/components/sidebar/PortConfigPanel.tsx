import { PortSelect } from "./PortSelect";
import { useSerialPorts } from "./usePortOptions";

export function PortConfigPanel() {
  const serial = useSerialPorts();

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
    </div>
  );
}
