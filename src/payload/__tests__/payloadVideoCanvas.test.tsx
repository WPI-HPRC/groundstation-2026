import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

let mockSize: { width: number; height: number } | null = null;
vi.mock("../video/usePayloadVideo", () => ({
  usePayloadVideo: () => mockSize,
}));

import { PayloadVideoCanvas } from "../video/PayloadVideoCanvas";

describe("PayloadVideoCanvas", () => {
  beforeEach(() => { mockSize = null; });

  it("calls onSize from an effect when video dimensions arrive", async () => {
    const onSize = vi.fn();
    mockSize = { width: 640, height: 480 };
    render(<PayloadVideoCanvas onSize={onSize} />);
    await waitFor(() => expect(onSize).toHaveBeenCalledWith(640, 480));
    expect(onSize).toHaveBeenCalledTimes(1);
  });

  it("does not call onSize again on re-render with the same size", async () => {
    const onSize = vi.fn();
    mockSize = { width: 640, height: 480 };
    const { rerender } = render(<PayloadVideoCanvas onSize={onSize} />);
    await waitFor(() => expect(onSize).toHaveBeenCalledTimes(1));
    rerender(<PayloadVideoCanvas onSize={onSize} />);
    expect(onSize).toHaveBeenCalledTimes(1);
  });
});
