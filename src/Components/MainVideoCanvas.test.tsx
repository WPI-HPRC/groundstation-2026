import { render } from "@testing-library/react";
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
    render(<MainVideoCanvas />);

    expect(useTauriVideoStreamMock).toHaveBeenCalledWith("live_vide", expect.any(Object));
  });
});
