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
  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <div style={{ fontSize: 12, letterSpacing: 2, color: "var(--fg-color-secondary)" }}>STATE</div>
      <div
        style={{
          fontSize: "clamp(20px, 4vw, 40px)",
          fontWeight: 800,
          color: state ? STATE_COLOR_VAR[state] : "var(--fg-color-secondary)",
        }}
      >
        {state ?? "—"}
      </div>
    </div>
  );
}
