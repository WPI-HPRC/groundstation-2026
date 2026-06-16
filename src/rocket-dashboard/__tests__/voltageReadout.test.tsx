import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VoltageReadout } from "../components/sidebar/VoltageReadout";

describe("VoltageReadout", () => {
  it("formats voltage to two decimals", () => {
    render(<VoltageReadout voltage={12.345} />);
    expect(screen.getByText("Voltage: 12.35 V")).toBeTruthy();
  });

  it("shows dashes when null", () => {
    render(<VoltageReadout voltage={null} />);
    expect(screen.getByText("Voltage: -- V")).toBeTruthy();
  });
});
