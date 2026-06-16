import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * COM/serial port chooser. Lists ports via `get_serial_port_names` and opens the chosen
 * one via `set_telem_serial_port`. In a plain browser (no Tauri runtime) `invoke` throws —
 * we catch it and show "ports unavailable" instead of crashing.
 */
export function PortSelector() {
  const [ports, setPorts] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const didInitRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<string[]>("get_serial_port_names");
      setPorts(list);
      setError(null);
    } catch {
      setPorts([]);
      setError("ports unavailable");
    }
  }, []);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    void refresh();
  }, [refresh]);

  const onSelect = async (port: string) => {
    setSelected(port);
    if (!port) return;
    try {
      // Tauri maps camelCase JS args to snake_case Rust params. If the merged backend
      // signature differs, match its exact param name here.
      await invoke("set_telem_serial_port", { portName: port });
      setError(null);
    } catch {
      setError("could not set port");
    }
  };

  return (
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
        <option value="">{error ?? "Select COM port"}</option>
        {ports.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <button
        onClick={() => void refresh()}
        title="Refresh ports"
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
  );
}
