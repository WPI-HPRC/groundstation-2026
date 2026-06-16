import { describe, it, expect } from "vitest";
import { PeakTracker } from "../telemetry/peaks";

describe("PeakTracker", () => {
  it("tracks the maximum value seen, monotonically", () => {
    const t = new PeakTracker();
    t.update(5);
    t.update(3);
    t.update(9);
    t.update(7);
    expect(t.max).toBe(9);
  });

  it("starts at 0 and ignores non-finite values", () => {
    const t = new PeakTracker();
    expect(t.max).toBe(0);
    t.update(NaN);
    t.update(Infinity);
    expect(t.max).toBe(0);
  });
});
