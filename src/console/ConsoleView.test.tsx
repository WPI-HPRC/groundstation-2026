import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { createTelemetrySourceMock, source } = vi.hoisted(() => {
  const source = {
    subscribe: vi.fn(() => vi.fn()),
    start: vi.fn(),
    stop: vi.fn(),
  };
  return {
    source,
    createTelemetrySourceMock: vi.fn(() => source),
  };
});

vi.mock("../rocket-dashboard/telemetry/createTelemetrySource", () => ({
  createTelemetrySource: createTelemetrySourceMock,
}));

import { ConsoleView } from "./ConsoleView";

describe("ConsoleView", () => {
  it("uses the shared telemetry source factory", () => {
    render(<ConsoleView />);

    expect(createTelemetrySourceMock).toHaveBeenCalledTimes(1);
    expect(source.subscribe).toHaveBeenCalledTimes(1);
    expect(source.start).toHaveBeenCalledTimes(1);
  });
});
