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
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const list = await invoke<string[]>(command);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setOptions(list);
      setError(null);
    } catch {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
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
