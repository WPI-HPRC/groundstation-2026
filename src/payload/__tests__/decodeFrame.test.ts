import { describe, it, expect } from "vitest";
import { rgbBase64ToImageData } from "../video/decodeFrame";

// 2x1 image: red pixel, green pixel -> RGB bytes [255,0,0, 0,255,0]
const RGB = new Uint8Array([255, 0, 0, 0, 255, 0]);
const B64 = Buffer.from(RGB).toString("base64");

describe("rgbBase64ToImageData", () => {
  it("expands RGB to RGBA with full alpha and correct size", () => {
    const img = rgbBase64ToImageData(B64, 2, 1);
    expect(img.width).toBe(2);
    expect(img.height).toBe(1);
    expect(Array.from(img.data)).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });
});
