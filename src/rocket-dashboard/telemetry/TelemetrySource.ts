import type { TelemetryFrame } from "./types";

export type FrameCallback = (frame: TelemetryFrame) => void;

export interface TelemetrySource {
  start(): void;
  stop(): void;
  /** Returns an unsubscribe function. */
  subscribe(cb: FrameCallback): () => void;
}
