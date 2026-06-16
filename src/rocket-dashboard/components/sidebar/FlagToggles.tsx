import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const FALLBACK_FLAGS = [
  "ArmFlight",
  "DeArmFlight",
  "Reset",
  "RemoteStartOn",
  "RemoteStartOff",
  "CanardsTest",
  "CanardsReset",
  "CanardsDisable",
  "CanardsEnable",
  "StartEstimator",
  "Abort",
];

export function FlagToggles() {
  const [flags, setFlags] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const didInitRef = useRef(false);

  const loadFlags = useCallback(async () => {
    try {
      const fromBackend = await invoke<string[]>("get_remote_control_flag_names");
      const next = fromBackend.length > 0 ? fromBackend : FALLBACK_FLAGS;
      setFlags(next);
      setSelected((prev) => (prev && next.includes(prev) ? prev : next[0] ?? ""));
      setError(null);
    } catch {
      setFlags(FALLBACK_FLAGS);
      setSelected((prev) => prev || FALLBACK_FLAGS[0]);
      setError("flags unavailable");
    }
  }, []);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    void loadFlags();
  }, [loadFlags]);

  const send = useCallback(async () => {
    if (!selected) return;
    try {
      await invoke("send_remote_control_flag", { commandName: selected });
      setError(null);
    } catch {
      setError("could not send flag");
    }
  }, [selected]);

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
          <option value="">{error ?? "Select flag"}</option>
          {flags.map((flag) => (
            <option key={flag} value={flag}>
              {flag}
            </option>
          ))}
        </select>
        <button
          onClick={() => void send()}
          disabled={!selected}
          style={{
            background: "var(--bg-color-secondary)",
            color: "var(--fg-color)",
            border: "none",
            borderRadius: 4,
            padding: "6px 12px",
            cursor: selected ? "pointer" : "not-allowed",
          }}
        >
          Send
        </button>
      </div>
      {error && <div style={{ color: "var(--fg-color-secondary)", fontSize: 11 }}>{error}</div>}
    </div>
  );
}
