import type { TelemetrySnapshot } from "../../telemetry/useTelemetry";
import { TimeSeriesChart } from "../charts/TimeSeriesChart";

const X = "#ff5a5f";
const Y = "#4ade80";
const Z = "#38bdf8";
const A = "#fbbf24";

const xyzDefs = [
  { label: "X", color: X },
  { label: "Y", color: Y },
  { label: "Z", color: Z },
];

const ALT_DEFS = [{ label: "Alt", color: A }];
const TEMP_DEFS = [{ label: "Temp", color: A }];

export function GraphsTab({ snap }: { snap: TelemetrySnapshot; isActive?: boolean }) {
  const { t, timeMode } = snap.history;
  const chartProps = { t, timeMode };
  return (    <div
      className="dash-graphs-stack"
      style={{
        height: "100%",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 8,
      }}
    >
      <div className="dash-chart-panel" style={{ flex: "1 1 0", minHeight: 130 }}>
        <TimeSeriesChart title="Gyroscope" {...chartProps} series={snap.history.gyro} defs={xyzDefs} yLabel="deg/s" />
      </div>
      <div className="dash-chart-panel" style={{ flex: "1 1 0", minHeight: 130 }}>
        <TimeSeriesChart
          title="Accelerometer"
          {...chartProps}
          series={snap.history.accel}
          defs={xyzDefs}
          yLabel="m/s²"
        />      </div>
      <div className="dash-chart-panel" style={{ flex: "1 1 0", minHeight: 130 }}>
        <TimeSeriesChart title="Magnetometer" {...chartProps} series={snap.history.mag} defs={xyzDefs} yLabel="µT" />
      </div>
      <div className="dash-chart-panel" style={{ flex: "1 1 0", minHeight: 130 }}>
        <TimeSeriesChart
          title="Altitude (barometer)"
          {...chartProps}
          series={[snap.history.altitude]}
          defs={ALT_DEFS}
          yLabel="m"
        />      </div>
      <div className="dash-chart-panel" style={{ flex: "1 1 0", minHeight: 130 }}>
        <TimeSeriesChart
          title="Temperature"
          {...chartProps}
          series={[snap.history.temperature]}
          defs={TEMP_DEFS}
          yLabel="°C"
        />      </div>
    </div>
  );
}
