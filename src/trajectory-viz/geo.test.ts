import { describe, it, expect } from "vitest";
import { enuToGeodetic } from "./geo";

const ORIGIN = { lat: 31.031080142681898, lon: -103.5400953745281, alt: 0 };

describe("enuToGeodetic", () => {
  it("maps origin (0,0,0) to the given origin coordinate", () => {
    const p = enuToGeodetic({ x: 0, y: 0, z: 0 }, ORIGIN);
    expect(p.lat).toBeCloseTo(ORIGIN.lat, 10);
    expect(p.lon).toBeCloseTo(ORIGIN.lon, 10);
    expect(p.alt).toBeCloseTo(0, 10);
  });
  it("moves ~1 deg latitude north for ~111320 m north", () => {
    const p = enuToGeodetic({ x: 0, y: 111320, z: 0 }, ORIGIN);
    expect(p.lat - ORIGIN.lat).toBeCloseTo(1, 2);
    expect(p.lon).toBeCloseTo(ORIGIN.lon, 6);
  });
  it("passes the up component through as altitude", () => {
    const p = enuToGeodetic({ x: 0, y: 0, z: 250 }, ORIGIN);
    expect(p.alt).toBeCloseTo(250, 6);
  });
});
