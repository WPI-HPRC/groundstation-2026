import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PayloadStateBadge } from "../components/PayloadStateBadge";
import { JoystickMonitor } from "../components/JoystickMonitor";
import { FlightState } from "../../rocket-dashboard/telemetry/types";

describe("payload components", () => {
  it("renders the flight-state word, or a dash when null", () => {
    const { rerender } = render(<PayloadStateBadge state={FlightState.Apogee} />);
    expect(screen.getByText("Apogee")).toBeTruthy();
    rerender(<PayloadStateBadge state={null} />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("renders joystick X/Y readouts", () => {
    render(<JoystickMonitor x={0.28} y={-0.12} />);
    expect(screen.getByText(/X \+0\.28/)).toBeTruthy();
    expect(screen.getByText(/Y −0\.12/)).toBeTruthy();
  });
});
