import { describe, it, expect } from "vitest";
import { RingBuffer } from "../telemetry/ringBuffer";

describe("RingBuffer", () => {
  it("keeps items up to capacity in insertion order", () => {
    const b = new RingBuffer<number>(3);
    b.push(1);
    b.push(2);
    expect(b.toArray()).toEqual([1, 2]);
    expect(b.size).toBe(2);
  });

  it("evicts oldest when over capacity", () => {
    const b = new RingBuffer<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => b.push(n));
    expect(b.toArray()).toEqual([3, 4, 5]);
    expect(b.size).toBe(3);
  });

  it("returns the latest item", () => {
    const b = new RingBuffer<number>(2);
    b.push(10);
    b.push(20);
    b.push(30);
    expect(b.latest()).toBe(30);
  });

  it("latest() is undefined when empty", () => {
    expect(new RingBuffer<number>(2).latest()).toBeUndefined();
  });
});
