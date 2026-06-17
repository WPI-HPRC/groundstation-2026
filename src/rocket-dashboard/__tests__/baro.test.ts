import { describe, it, expect } from "vitest";
import { pressureToAltitude, SEA_LEVEL_HPA } from "../telemetry/baro";

describe("pressureToAltitude", () => {
  it("returns ~0 m at sea-level pressure", () => {
    expect(pressureToAltitude(SEA_LEVEL_HPA)).toBeCloseTo(0, 1);
  });

  it("increases as pressure decreases", () => {
    const low = pressureToAltitude(500);
    const high = pressureToAltitude(900);
    expect(low).toBeGreaterThan(high);
    expect(Number.isFinite(low)).toBe(true);
  });

  it("returns 0 for non-finite input", () => {
    expect(pressureToAltitude(NaN)).toBe(0);
  });
});
