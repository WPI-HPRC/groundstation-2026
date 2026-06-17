import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function PortSelect({
  label,
  options,
  error,
  onRefresh,
  setCommand,
  argName,
}: {
  label: string;
  options: string[];
  error: string | null;
  onRefresh: () => void;
  setCommand: string;
  argName: "portName" | "device";
}) {
  const [selected, setSelected] = useState("");
  const [setError, setSetError] = useState<string | null>(null);

  const onSelect = async (value: string) => {
    setSelected(value);
    if (!value) return;
    try {
      await invoke(setCommand, { [argName]: value });
      setSetError(null);
    } catch {
      setSetError("could not set port");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 12, letterSpacing: 1.2, color: "var(--fg-color-secondary)" }}>{label}</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select
          value={selected}
          onChange={(e) => void onSelect(e.target.value)}
          style={{
            flex: 1,
            background: "var(--bg-color-secondary)",
            color: "var(--fg-color)",
            padding: 6,
            border: "none",
            borderRadius: 4,
          }}
        >
          <option value="">{setError ?? error ?? "Select"}</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <button
          onClick={onRefresh}
          title="Refresh"
          style={{
            background: "var(--bg-color-secondary)",
            color: "var(--fg-color)",
            border: "none",
            borderRadius: 4,
            padding: "6px 10px",
            cursor: "pointer",
          }}
        >
          ⟳
        </button>
      </div>
    </div>
  );
}
