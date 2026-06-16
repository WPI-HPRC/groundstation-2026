import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatePanel } from "../components/sidebar/StatePanel";
import { FlightState } from "../telemetry/types";

describe("StatePanel", () => {
  it("renders the current flight state text", () => {
    render(<StatePanel state={FlightState.Boost} />);
    expect(screen.getByText("Boost")).toBeTruthy();
  });

  it("shows a placeholder when state is null", () => {
    render(<StatePanel state={null} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
