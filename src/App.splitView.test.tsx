import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./rocket-dashboard/telemetry/createTelemetrySource", () => ({
  createTelemetrySource: () => ({
    subscribe: vi.fn(() => vi.fn()),
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock("./Components/TrajectoryViewer", () => ({
  TrajectoryViewer: () => <div data-testid="trajectory-viewer" />,
}));

vi.mock("./Components/RocketViewer", () => ({
  RocketViewer: () => <div data-testid="rocket-viewer" />,
}));

vi.mock("./Components/MaxStats", () => ({
  MaxStats: () => <div data-testid="max-stats" />,
}));

vi.mock("./Components/ArcGauge", () => ({
  default: () => <div data-testid="arc-gauge" />,
}));

vi.mock("./Components/ProgressBar", () => ({
  default: () => <div data-testid="progress-bar" />,
}));

import App from "./App";

describe("App split view selector", () => {
  it("opens on Escape and switches the full-screen video when a choice is clicked", () => {
    render(<App />);

    expect(screen.getByLabelText("Live rocket video")).toBeTruthy();
    expect(document.querySelectorAll("img.video-canvas")).toHaveLength(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Select video view" })).toBeTruthy();
    expect(screen.queryByLabelText("Live rocket video")).toBeNull();
    expect(screen.getByLabelText("Live video preview")).toBeTruthy();
    expect(screen.getByLabelText("Ground tracking preview")).toBeTruthy();
    expect(document.querySelectorAll("img.video-canvas")).toHaveLength(2);

    fireEvent.click(screen.getByText("Ground Tracking"));
    expect(screen.queryByRole("dialog", { name: "Select video view" })).toBeNull();
    expect(screen.getByLabelText("Ground tracking video")).toBeTruthy();
    const img = document.querySelector("img.video-canvas") as HTMLImageElement;
    expect(img.src).toBe("http://127.0.0.1:17777/video/tracking.mjpg");
  });
});
