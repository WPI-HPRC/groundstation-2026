import { describe, it, expect } from "vitest";
import { needleAngleDeg } from "../components/sidebar/VelocityDial";

describe("needleAngleDeg", () => {
  // Sweep is 240deg, starting at 150deg (clockwise) to 390deg.
  it("min value sits at the start angle", () => {
    expect(needleAngleDeg(0, 0, 400)).toBeCloseTo(150, 6);
  });
  it("max value sits at the end angle", () => {
    expect(needleAngleDeg(400, 0, 400)).toBeCloseTo(390, 6);
  });
  it("mid value sits halfway", () => {
    expect(needleAngleDeg(200, 0, 400)).toBeCloseTo(270, 6);
  });
  it("clamps out-of-range values", () => {
    expect(needleAngleDeg(-50, 0, 400)).toBeCloseTo(150, 6);
    expect(needleAngleDeg(999, 0, 400)).toBeCloseTo(390, 6);
  });
});
