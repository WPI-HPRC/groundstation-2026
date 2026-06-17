import { describe, it, expect } from "vitest";
import { stateLabel, joystickToKnob, parseBlobs, type RawField } from "../telemetry/payloadFields";
import { FlightState } from "../../rocket-dashboard/telemetry/types";

const f = (value: string): RawField => ({ timestamp: 1, value });

describe("payloadFields", () => {
  it("maps a numeric state index to the flight-state label", () => {
    expect(stateLabel(f("1"))).toBe(FlightState.Boost);
    expect(stateLabel(null)).toBe(null);
    expect(stateLabel(f("99"))).toBe(null);
  });

  it("maps joystick [-1,1] to fractional knob offset clamped to the dial", () => {
    expect(joystickToKnob(0, 0)).toEqual({ left: 0.5, top: 0.5 });
    // x=+1 -> right edge; y=+1 (up) -> top
    expect(joystickToKnob(1, 1)).toEqual({ left: 1, top: 0 });
    expect(joystickToKnob(-1, -1)).toEqual({ left: 0, top: 1 });
    expect(joystickToKnob(5, -5)).toEqual({ left: 1, top: 1 }); // clamped
  });

  it("collects only blobs whose x AND y fields are present", () => {
    const fields = new Map<string, RawField>([
      ["blob_x0", f("10")], ["blob_y0", f("20")],
      ["blob_ellipse_a0", f("5")], ["blob_ellipse_b0", f("3")],
      ["blob_rotation0", f("0")], ["blob_confidence0", f("0.9")],
      ["blob_x1", f("30")], // y1 missing -> skipped
    ]);
    const blobs = parseBlobs(fields, 4);
    expect(blobs).toHaveLength(1);
    expect(blobs[0]).toMatchObject({ x: 10, y: 20, a: 5, b: 3, confidence: 0.9 });
  });
});
