import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(null) }));

// Three.js-dependent components require WebGL which is unavailable in jsdom.
vi.mock("../../Components/RocketViewer", () => ({
  RocketViewer: () => null,
}));
vi.mock("../../Components/TrajectoryViewer", () => ({
  TrajectoryViewer: () => null,
}));

import App from "../../App";

describe("main App", () => {
  it("no longer renders the KV0R callsign badge", () => {
    const { container } = render(<App />);
    expect(container.querySelector(".callsign-badge")).toBeNull();
    expect(container.textContent).not.toContain("KV0R");
  });
});
