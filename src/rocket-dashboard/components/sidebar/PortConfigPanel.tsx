import { PortSelect } from "./PortSelect";
import { useSerialPorts, useVideoDevices } from "./usePortOptions";

export function PortConfigPanel() {
  const serial = useSerialPorts();
  const video = useVideoDevices();

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
        label="Live video webcam"
        options={video.options}
        error={video.error}
        onRefresh={video.refresh}
        setCommand="set_front_camera_device"
        argName="device"
      />
      <PortSelect
        label="Tracking webcam"
        options={video.options}
        error={video.error}
        onRefresh={video.refresh}
        setCommand="set_payload_camera_device"
        argName="device"
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
