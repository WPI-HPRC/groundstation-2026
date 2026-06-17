import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { useTauriVideoStreamMock } = vi.hoisted(() => ({
  useTauriVideoStreamMock: vi.fn(),
}));

vi.mock("../video/useTauriVideoStream", () => ({
  useTauriVideoStream: useTauriVideoStreamMock,
}));

import { MainVideoCanvas } from "./MainVideoCanvas";

describe("MainVideoCanvas", () => {
  it("subscribes to the live video backend stream", () => {
    render(<MainVideoCanvas streamName="live_vide" />);

    expect(useTauriVideoStreamMock).toHaveBeenCalledWith(
      "live_vide",
      expect.any(Object),
      expect.objectContaining({ bufferFrames: 1, pollMs: 33, renderMs: 33 })
    );
    expect(screen.getByText("NO SIGNAL")).toBeTruthy();
  });
});
