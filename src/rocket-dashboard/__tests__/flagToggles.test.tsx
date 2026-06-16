import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FlagToggles } from "../components/sidebar/FlagToggles";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

describe("FlagToggles", () => {
  it("renders a dropdown of commands and a Send button", () => {
    render(<FlagToggles />);

    const select = screen.getByLabelText("Select flag") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(screen.getByText("Send")).toBeTruthy();
    expect(select.querySelectorAll("option").length).toBeGreaterThan(1);
  });

  it("invokes send_command when clicking Send", async () => {
    invokeMock.mockResolvedValue(undefined);
    render(<FlagToggles />);
    const select = screen.getByLabelText("Select flag") as HTMLSelectElement;

    // pick first non-empty flag option if present
    const options = Array.from(select.options).map((o) => o.value).filter(Boolean);
    if (options.length > 0) fireEvent.change(select, { target: { value: options[0] } });

    fireEvent.click(screen.getByText("Send"));
    expect(invokeMock).toHaveBeenCalled();
  });
});
