import { FlightState } from "../../telemetry/types";

const STATE_COLOR_VAR: Record<FlightState, string> = {
  [FlightState.PreLaunch]: "var(--flight-state-prelaunch)",
  [FlightState.Boost]: "var(--flight-state-boost)",
  [FlightState.Coast]: "var(--flight-state-coast)",
  [FlightState.Apogee]: "var(--flight-state-apogee)",
  [FlightState.DrogueDescent]: "var(--flight-state-drogue-descent)",
  [FlightState.MainDescent]: "var(--flight-state-main-descent)",
  [FlightState.Landed]: "var(--flight-state-landed)",
};

export function StatePanel({ state }: { state: FlightState | null }) {
  const bg = state ? STATE_COLOR_VAR[state] : "var(--bg-color-secondary)";
  const fg = state ? "var(--fg-color)" : "var(--fg-color-secondary)";
  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <div style={{ fontSize: 12, letterSpacing: 2, color: "var(--fg-color-secondary)" }}>STATE</div>
      <div
        style={{
          marginTop: 6,
          display: "inline-block",
          padding: "6px 20px",
          border: "1px solid rgba(17, 24, 39, 0.25)",
          fontSize: "clamp(14px, 2.2vw, 20px)",
          background: bg,
          color: fg,
        }}
      >
        {state ?? "—"}
      </div>
    </div>
  );
}
