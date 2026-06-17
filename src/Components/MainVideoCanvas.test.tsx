import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MainVideoCanvas } from "./MainVideoCanvas";

describe("MainVideoCanvas", () => {
  it("renders the local MJPEG stream URL", () => {
    render(<MainVideoCanvas streamName="live_vide" />);

    const img = document.querySelector("img.video-canvas") as HTMLImageElement;
    expect(img.src).toBe("http://127.0.0.1:17777/video/live_vide.mjpg");
    expect(screen.getByText("NO SIGNAL")).toBeTruthy();
  });
});
