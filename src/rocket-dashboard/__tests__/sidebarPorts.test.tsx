import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("../../Components/RocketViewer", () => ({
  RocketViewer: () => <div data-testid="rocket-viewer" />,
}));
vi.mock("../../Components/ArcGauge", () => ({
  default: () => <div data-testid="arc-gauge" />,
}));

import { Sidebar } from "../components/sidebar/Sidebar";

describe("Sidebar port config", () => {
  beforeEach(() => {
    invokeMock.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__TAURI_INTERNALS__;
  });

  it("renders the five-port config panel", () => {
    render(<Sidebar latest={null} />);
    expect(screen.getByText("Tracker serial")).toBeTruthy();
    expect(screen.getByText("Pointing serial")).toBeTruthy();
  });
});
