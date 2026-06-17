import { useEffect, useRef, useState } from "react";
import { createTelemetrySource } from "../rocket-dashboard/telemetry/createTelemetrySource";
import type { TelemetryFrame } from "../rocket-dashboard/telemetry/types";
import {
  formatConsolePrefix,
  normalizeEpochMs,
  updateLaunchWallMs,
} from "../rocket-dashboard/telemetry/timebase";
import { FlightState } from "../rocket-dashboard/telemetry/types";
const MAX_LINES = 500;

function fmt(prefix: string, f: TelemetryFrame): string {
  const n = (x: number) => x.toFixed(2);
  return (
    `[${prefix}] ` +
    `state=${f.state} v=${n(f.velocity)} a=${n(f.acceleration)} alt=${n(f.altitude)} ` +
    `volt=${n(f.voltage)} ` +
    `q=(${n(f.orientation.w)},${n(f.orientation.i)},${n(f.orientation.j)},${n(f.orientation.k)}) ` +
    `gyro=(${n(f.gyro.x)},${n(f.gyro.y)},${n(f.gyro.z)}) ` +
    `acc=(${n(f.accel.x)},${n(f.accel.y)},${n(f.accel.z)}) ` +
    `mag=(${n(f.mag.x)},${n(f.mag.y)},${n(f.mag.z)}) ` +
    `pos=(${n(f.positionLocal.x)},${n(f.positionLocal.y)},${n(f.positionLocal.z)})`
  );
}

export function ConsoleView() {
  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const launchWallMsRef = useRef<number | null>(null);
  const lastStateRef = useRef<FlightState>(FlightState.PreLaunch);

  useEffect(() => {
    const source = createTelemetrySource();
    const unsub = source.subscribe((f) => {
      if (pausedRef.current) return;

      const wallNow = Date.now();
      const frameMs = normalizeEpochMs(f.timestamp, wallNow);
      launchWallMsRef.current = updateLaunchWallMs(
        f.state,
        frameMs,
        launchWallMsRef.current,
        lastStateRef.current
      );
      lastStateRef.current = f.state;

      const prefix = formatConsolePrefix(launchWallMsRef.current, wallNow);
      setLines((prev) => {
        const next = prev.length >= MAX_LINES ? prev.slice(prev.length - MAX_LINES + 1) : prev.slice();
        next.push(fmt(prefix, f));
        return next;
      });
    });
    source.start();
    return () => {
      unsub();
      source.stop();
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
    return () => cancelAnimationFrame(id);
  }, [lines, paused]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#050607",
        color: "#86efac",
        fontFamily: "monospace",
        fontSize: 12,
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          padding: 6,
          borderBottom: "1px solid #222",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <strong style={{ color: "#e5e7eb" }}>CONSOLE</strong>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          style={{
            background: "#222",
            color: "#fff",
            border: "none",
            padding: "4px 10px",
            cursor: "pointer",
            borderRadius: 4,
          }}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          onClick={() => setLines([])}
          style={{
            background: "#222",
            color: "#fff",
            border: "none",
            padding: "4px 10px",
            cursor: "pointer",
            borderRadius: 4,
          }}
        >
          Clear
        </button>
        <span style={{ color: "#888" }}>{lines.length} lines</span>
      </div>
      <div style={{ flex: "1 1 auto", overflowY: "auto", padding: 6, whiteSpace: "pre-wrap" }}>
        {lines.map((l) => (
          <div key={l}>{l}</div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

