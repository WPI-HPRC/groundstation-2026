import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(null) }));

import { PayloadApp } from "../PayloadApp";

describe("PayloadApp", () => {
  it("mounts with a video canvas and the joystick + state panels", () => {
    const { container } = render(<PayloadApp />);
    expect(container.querySelector("canvas")).toBeTruthy();
    expect(container.querySelector("img")).toBeTruthy(); // WPI logo
  });
});
