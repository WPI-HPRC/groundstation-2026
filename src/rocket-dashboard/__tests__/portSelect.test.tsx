import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { PortSelect } from "../components/sidebar/PortSelect";

describe("PortSelect", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__TAURI_INTERNALS__;
  });

  it("renders its label and options", () => {
    render(
      <PortSelect
        label="Telem radio"
        options={["COM1", "COM3"]}
        error={null}
        onRefresh={() => {}}
        setCommand="set_telem_serial_port"
        argName="portName"
      />,
    );
    expect(screen.getByText("Telem radio")).toBeTruthy();
    expect(screen.getByRole("option", { name: "COM3" })).toBeTruthy();
  });

  it("invokes the set command with the configured arg name on change", async () => {
    invokeMock.mockResolvedValue(undefined);
    render(
      <PortSelect
        label="Live video"
        options={["0: Cam"]}
        error={null}
        onRefresh={() => {}}
        setCommand="set_front_camera_device"
        argName="device"
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "0: Cam" } });
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("set_front_camera_device", { device: "0: Cam" }),
    );
  });

  it("shows an error when the set command rejects (e.g. command not built)", async () => {
    invokeMock.mockImplementation(async () => {
      throw new Error("no command");
    });
    render(
      <PortSelect
        label="Tracker serial"
        options={["COM5"]}
        error={null}
        onRefresh={() => {}}
        setCommand="set_tracker_serial_port"
        argName="portName"
      />,
    );
    await act(async () => {
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "COM5" } });
    });
    await waitFor(() => expect(screen.getByText("could not set port")).toBeTruthy());
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("COM5");
  });
});
