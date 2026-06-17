import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { VisionOverlay } from "../components/VisionOverlay";

describe("VisionOverlay", () => {
  it("uses slice preserveAspectRatio to match canvas object-fit cover", () => {
    const { container } = render(
      <VisionOverlay width={1280} height={800} horizon={null} blobs={[]} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
  });
});
