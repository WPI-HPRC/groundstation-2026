import { describe, it, expect } from "vitest";
import { quatToThree } from "../telemetry/quat";

describe("quatToThree", () => {
  it("maps {w,i,j,k} to Three.js [x,y,z,w] order", () => {
    expect(quatToThree({ w: 1, i: 0, j: 0, k: 0 })).toEqual([0, 0, 0, 1]);
  });

  it("maps a 90deg rotation about Z (k axis) correctly", () => {
    const c = Math.cos(Math.PI / 4);
    const s = Math.sin(Math.PI / 4);
    const out = quatToThree({ w: c, i: 0, j: 0, k: s });
    expect(out[0]).toBeCloseTo(0, 10); // x = i
    expect(out[1]).toBeCloseTo(0, 10); // y = j
    expect(out[2]).toBeCloseTo(s, 10); // z = k
    expect(out[3]).toBeCloseTo(c, 10); // w
  });
});
