import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlightState } from "../telemetry/types";
import { pressureToAltitude, SEA_LEVEL_HPA } from "../telemetry/baro";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { TauriTelemetrySource } from "../telemetry/TauriTelemetrySource";

const mockInvoke = vi.mocked(invoke);

type TelemetryInvokeArgs = { storeName: string; fieldName: string };

function dto(value: string | number, timestamp = 1000) {
  return { timestamp, value: String(value) };
}

const EXPECTED_FIELDS = [
  "state",
  "battery_voltage",
  "temp",
  "pressure",
  "asm330_gyr0",
  "asm330_gyr1",
  "asm330_gyr2",
  "asm330_accel0",
  "asm330_accel1",
  "asm330_accel2",
  "mag0",
  "mag1",
  "mag2",
  "w",
  "i",
  "j",
  "k",
  "vel_x",
  "vel_y",
  "vel_z",
  "pos_x",
  "pos_y",
  "pos_z",
] as const;

function fullFrameValues(ts = 1000, pressure = SEA_LEVEL_HPA) {
  return {
    state: 2,
    battery_voltage: 12.4,
    temp: 25.5,
    pressure,
    asm330_gyr0: 1,
    asm330_gyr1: 2,
    asm330_gyr2: 3,
    asm330_accel0: 0,
    asm330_accel1: 0,
    asm330_accel2: 9.8,
    mag0: 10,
    mag1: 20,
    mag2: 30,
    w: 1,
    i: 0,
    j: 0,
    k: 0,
    vel_x: 0,
    vel_y: 0,
    vel_z: 100,
    pos_x: 1,
    pos_y: 2,
    pos_z: 500,
    ts,
  };
}

async function flushPoll() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function installFullFrameMock(overrides: Partial<ReturnType<typeof fullFrameValues>> = {}) {
  const values = { ...fullFrameValues(), ...overrides };
  mockInvoke.mockImplementation(async (_cmd, args?: unknown) => {
    const invokeArgs = args as TelemetryInvokeArgs | undefined;
    expect(invokeArgs?.storeName).toBe("rocket");
    const fieldName = invokeArgs?.fieldName;
    if (!fieldName) return null;
    const v = values[fieldName as keyof typeof values];
    if (v === undefined) return null;
    const ts = typeof values.ts === "number" ? values.ts : 1000;
    return dto(v as string | number, ts);
  });
}

describe("TauriTelemetrySource", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInvoke.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requests get_latest_telemetry for all rocket store field names", async () => {
    installFullFrameMock();
    const src = new TauriTelemetrySource({ updateHz: 20 });
    src.start();
    await flushPoll();
    src.stop();

    expect(mockInvoke).toHaveBeenCalled();
    const fieldNames = mockInvoke.mock.calls
      .filter(([cmd]) => cmd === "get_latest_telemetry")
      .map(([, args]) => (args as TelemetryInvokeArgs | undefined)?.fieldName);
    for (const field of EXPECTED_FIELDS) {
      expect(fieldNames).toContain(field);
    }
  });

  it("maps backend values into a telemetry frame with baro altitude", async () => {
    const pressure = 900;
    installFullFrameMock({ pressure });
    const src = new TauriTelemetrySource({ updateHz: 20 });
    let frame: import("../telemetry/types").TelemetryFrame | null = null;
    src.subscribe((f) => {
      frame = f;
    });
    src.start();
    await flushPoll();
    src.stop();

    expect(frame).not.toBeNull();
    expect(frame!.state).toBe(FlightState.Coast);
    expect(frame!.voltage).toBeCloseTo(12.4);
    expect(frame!.temperature).toBeCloseTo(25.5);
    expect(frame!.altitude).toBeCloseTo(pressureToAltitude(pressure), 3);
    expect(frame!.velocity).toBeCloseTo(100);
    expect(frame!.gyro).toEqual({ x: 1, y: 2, z: 3 });
    expect(frame!.orientation).toEqual({ w: 1, i: 0, j: 0, k: 0 });
  });

  it("emits the first frame with safe defaults when EKF fields are missing", async () => {
    const values = fullFrameValues();
    mockInvoke.mockImplementation(async (_cmd, args?: unknown) => {
      const fieldName = (args as TelemetryInvokeArgs | undefined)?.fieldName;
      if (!fieldName) return null;
      if (["w", "i", "j", "k", "vel_x", "vel_y", "vel_z", "pos_x", "pos_y", "pos_z"].includes(fieldName)) {
        return null;
      }
      const v = values[fieldName as keyof typeof values];
      if (v === undefined) return null;
      return dto(v as string | number, values.ts);
    });

    const src = new TauriTelemetrySource({ updateHz: 20 });
    let frame: import("../telemetry/types").TelemetryFrame | null = null;
    src.subscribe((f) => {
      frame = f;
    });
    src.start();
    await flushPoll();
    src.stop();

    expect(frame).not.toBeNull();
    expect(frame!.orientation).toEqual({ w: 1, i: 0, j: 0, k: 0 });
    expect(frame!.velocity).toBe(0);
    expect(frame!.positionLocal).toEqual({ x: 0, y: 0, z: 0 });
    expect(src.diagnostics().missingFirstFrameFields).toEqual([
      "w",
      "i",
      "j",
      "k",
      "vel_x",
      "vel_y",
      "vel_z",
      "pos_x",
      "pos_y",
      "pos_z",
    ]);
  });

  it("skips overlapping poll ticks while a poll is in flight", async () => {
    let releasePoll: (() => void) | undefined;
    const pollGate = new Promise<void>((resolve) => {
      releasePoll = resolve;
    });

    installFullFrameMock();
    mockInvoke.mockImplementation(async (_cmd, args?: unknown) => {
      await pollGate;
      const values = fullFrameValues();
      const fieldName = (args as TelemetryInvokeArgs | undefined)?.fieldName;
      if (!fieldName) return null;
      const v = values[fieldName as keyof typeof values];
      if (v === undefined) return null;
      return dto(v as string | number, values.ts);
    });

    const src = new TauriTelemetrySource({ updateHz: 100 });
    src.start();
    await Promise.resolve();

    vi.advanceTimersByTime(30);
    releasePoll!();
    await flushPoll();
    src.stop();

    expect(src.diagnostics().droppedFrames).toBeGreaterThan(0);
  });

  it("drops frames with regressive timestamps", async () => {
    let invokeCount = 0;
    mockInvoke.mockImplementation(async (_cmd, args?: unknown) => {
      const wave = Math.floor(invokeCount / EXPECTED_FIELDS.length);
      invokeCount += 1;
      const ts = wave === 0 ? 2000 : 1000;
      const values = fullFrameValues(ts);
      const fieldName = (args as TelemetryInvokeArgs | undefined)?.fieldName;
      if (!fieldName) return null;
      const v = values[fieldName as keyof typeof values];
      if (v === undefined) return null;
      return dto(v as string | number, ts);
    });

    const src = new TauriTelemetrySource({ updateHz: 20 });
    const frames: number[] = [];
    src.subscribe((f) => frames.push(f.timestamp));
    src.start();
    await flushPoll();
    await vi.advanceTimersByTimeAsync(50);
    await flushPoll();
    src.stop();

    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames.every((ts, i) => i === 0 || ts >= frames[i - 1])).toBe(true);
    expect(src.diagnostics().droppedFrames).toBeGreaterThan(0);
  });
});
