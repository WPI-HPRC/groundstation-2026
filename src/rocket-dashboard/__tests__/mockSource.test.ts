import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockTelemetrySource } from "../telemetry/MockTelemetrySource";
import { FlightState, FLIGHT_STATE_ORDER } from "../telemetry/types";

describe("MockTelemetrySource", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits frames at the configured rate after start()", () => {
    const src = new MockTelemetrySource({ updateHz: 10, loop: false });
    const cb = vi.fn();
    src.subscribe(cb);
    src.start();
    vi.advanceTimersByTime(1000); // 1s at 10Hz -> ~10 frames
    src.stop();
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(9);
    expect(cb.mock.calls.length).toBeLessThanOrEqual(11);
  });

  it("does not emit after stop()", () => {
    const src = new MockTelemetrySource({ updateHz: 10, loop: false });
    const cb = vi.fn();
    src.subscribe(cb);
    src.start();
    vi.advanceTimersByTime(300);
    src.stop();
    const countAfterStop = cb.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(cb.mock.calls.length).toBe(countAfterStop);
  });

  it("progresses through all flight states in order over a full profile", () => {
    const src = new MockTelemetrySource({ updateHz: 50, loop: false });
    const seen: FlightState[] = [];
    src.subscribe((f) => {
      if (seen[seen.length - 1] !== f.state) seen.push(f.state);
    });
    src.start();
    vi.advanceTimersByTime(60_000); // long enough to finish the profile
    src.stop();
    // states appear in the canonical order (no out-of-order transitions)
    const idx = seen.map((s) => FLIGHT_STATE_ORDER.indexOf(s));
    for (let i = 1; i < idx.length; i++) {
      expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1]);
    }
    expect(seen[0]).toBe(FlightState.PreLaunch);
    expect(seen[seen.length - 1]).toBe(FlightState.Landed);
  });

  it("emits finite, in-range values", () => {
    const src = new MockTelemetrySource({ updateHz: 20, loop: false });
    let last = null as null | import("../telemetry/types").TelemetryFrame;
    src.subscribe((f) => (last = f));
    src.start();
    vi.advanceTimersByTime(2000);
    src.stop();
    expect(last).not.toBeNull();
    const f = last!;
    expect(Number.isFinite(f.velocity)).toBe(true);
    expect(f.velocity).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(f.voltage)).toBe(true);
    expect(f.voltage).toBeGreaterThan(0);
    const qnorm = Math.hypot(f.orientation.w, f.orientation.i, f.orientation.j, f.orientation.k);
    expect(qnorm).toBeCloseTo(1, 3);
  });
});
