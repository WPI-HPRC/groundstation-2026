import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { PortConfigPanel } from "../components/sidebar/PortConfigPanel";

describe("PortConfigPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__TAURI_INTERNALS__;
  });

  it("renders serial selectors and debug spoof control", async () => {
    invokeMock.mockResolvedValue([]);
    render(<PortConfigPanel />);
    for (const label of [
      "Telem radio",
      "Tracker serial",
      "Pointing serial",
      "Debug telemetry",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Spoof Rocket Frame" })).toBeTruthy();
  });

  it("loads serial ports once for the shared serial hooks", async () => {
    invokeMock.mockResolvedValue([]);
    render(<PortConfigPanel />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("get_serial_port_names"));
    const serialCalls = invokeMock.mock.calls.filter((c) => c[0] === "get_serial_port_names").length;
    expect(serialCalls).toBe(1);
  });

  it("invokes the debug spoof command from the dashboard", async () => {
    invokeMock.mockResolvedValue([]);
    render(<PortConfigPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Spoof Rocket Frame" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("spoof_rocket_telemetry_once"));
  });
});
