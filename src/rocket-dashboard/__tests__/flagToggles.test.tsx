import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FlagToggles } from "../components/sidebar/FlagToggles";

describe("FlagToggles", () => {
  it("renders a dropdown of flags and a Send button", async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0) as any);
    render(<FlagToggles />);

    const select = screen.getByLabelText("Select flag") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(screen.getByText("Send")).toBeTruthy();

    // Flags are loaded asynchronously (from backend invoke or fallback).
    await waitFor(() => {
      expect(select.querySelectorAll("option").length).toBeGreaterThan(1);
    });
  });

  it("invokes send when clicking Send", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("no tauri"));
    vi.mock("@tauri-apps/api/core", () => ({ invoke }));

    render(<FlagToggles />);
    const select = screen.getByLabelText("Select flag") as HTMLSelectElement;

    await waitFor(() => {
      expect(select.querySelectorAll("option").length).toBeGreaterThan(1);
    });

    // pick first non-empty flag option if present
    const options = Array.from(select.options).map((o) => o.value).filter(Boolean);
    if (options.length > 0) fireEvent.change(select, { target: { value: options[0] } });

    fireEvent.click(screen.getByText("Send"));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
  });
});
