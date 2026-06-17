import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface PortOptions {
  options: string[];
  error: string | null;
  refresh: () => void;
}

function useInvokeList(command: string, errorText: string): PortOptions {
  const [options, setOptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const didInit = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<string[]>(command);
      setOptions(list);
      setError(null);
    } catch {
      setOptions([]);
      setError(errorText);
    }
  }, [command, errorText]);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void refresh();
  }, [refresh]);

  return { options, error, refresh };
}

export function useSerialPorts(): PortOptions {
  return useInvokeList("get_serial_port_names", "ports unavailable");
}

export function useVideoDevices(): PortOptions {
  return useInvokeList("list_video_devices", "devices unavailable");
}
