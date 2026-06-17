import { describe, it, expect } from "vitest";
import { FrameBuffer, type BufferedFrame } from "../video/FrameBuffer";

function frame(ts: number): BufferedFrame {
  return { timestamp: ts, image: { width: 1, height: 1 } as unknown as ImageData };
}

describe("FrameBuffer", () => {
  it("ignores duplicate timestamps", () => {
    const b = new FrameBuffer(3);
    b.push(frame(1));
    b.push(frame(1));
    expect(b.size).toBe(1);
  });

  it("holds (returns null) until filled to capacity, then emits oldest-first", () => {
    const b = new FrameBuffer(3);
    b.push(frame(1));
    expect(b.next()).toBeNull(); // size 1 < 3
    b.push(frame(2));
    b.push(frame(3));
    expect(b.next()?.timestamp).toBe(1); // now full -> emit oldest
    expect(b.next()?.timestamp).toBe(2);
  });

  it("drops the oldest frame when over capacity", () => {
    const b = new FrameBuffer(2);
    b.push(frame(1));
    b.push(frame(2));
    b.push(frame(3)); // evicts ts=1
    expect(b.next()?.timestamp).toBe(2);
  });
});
