import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { PortConfigPanel } from "../components/sidebar/PortConfigPanel";

describe("PortConfigPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__TAURI_INTERNALS__;
  });

  it("renders all five labeled selectors", async () => {
    invokeMock.mockResolvedValue([]);
    render(<PortConfigPanel />);
    for (const label of [
      "Telem radio",
      "Live video webcam",
      "Tracking webcam",
      "Tracker serial",
      "Pointing serial",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("loads serial ports once and video devices once (shared hooks)", async () => {
    invokeMock.mockResolvedValue([]);
    render(<PortConfigPanel />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_serial_port_names"));
    const serialCalls = invokeMock.mock.calls.filter((c) => c[0] === "get_serial_port_names").length;
    const videoCalls = invokeMock.mock.calls.filter((c) => c[0] === "list_video_devices").length;
    expect(serialCalls).toBe(1);
    expect(videoCalls).toBe(1);
  });
});
