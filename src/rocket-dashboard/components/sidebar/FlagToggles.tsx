import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const COMMANDS: { label: string; cmd: number }[] = [
  { label: "ArmFlight", cmd: 0 },
  { label: "DeArmFlight", cmd: 1 },
  { label: "Reset", cmd: 2 },
  { label: "RemoteStartOn", cmd: 3 },
  { label: "RemoteStartOff", cmd: 4 },
  { label: "CanardsTest", cmd: 5 },
  { label: "CanardsReset", cmd: 6 },
  { label: "CanardsDisable", cmd: 7 },
  { label: "CanardsEnable", cmd: 8 },
  { label: "StartEstimator", cmd: 9 },
  { label: "Abort", cmd: 10 },
];

export function FlagToggles() {
  const [selected, setSelected] = useState(COMMANDS[0]?.label ?? "");
  const [error, setError] = useState<string | null>(null);
  const selectedCmd = COMMANDS.find((c) => c.label === selected)?.cmd ?? null;

  const send = useCallback(async () => {
    if (selectedCmd == null) return;
    try {
      await invoke("send_command", { cmd: selectedCmd });
      setError(null);
    } catch {
      setError("command unavailable");
    }
  }, [selectedCmd]);

  return (
    <div
      style={{
        border: "1px solid var(--bg-color-secondary)",
        borderRadius: 6,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: 1.2, color: "var(--fg-color-secondary)" }}>FLAGS</div>
      <div style={{ display: "flex", gap: 8 }}>
        <select
          aria-label="Select flag"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{
            flex: 1,
            background: "var(--bg-color-secondary)",
            color: "var(--fg-color)",
            border: "none",
            borderRadius: 4,
            padding: 6,
          }}
        >
          {/* Placeholder for error display; intentionally not user-selectable. */}
          {error && (
            <option value="" disabled hidden>
              {error}
            </option>
          )}
          {COMMANDS.map((c) => (
            <option key={c.label} value={c.label}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => void send()}
          disabled={selectedCmd == null}
          style={{
            background: "var(--bg-color-secondary)",
            color: "var(--fg-color)",
            border: "none",
            borderRadius: 4,
            padding: "6px 12px",
            cursor: selectedCmd == null ? "not-allowed" : "pointer",
          }}
        >
          Send
        </button>
      </div>
      {error && <div style={{ color: "var(--fg-color-secondary)", fontSize: 11 }}>{error}</div>}
    </div>
  );
}
