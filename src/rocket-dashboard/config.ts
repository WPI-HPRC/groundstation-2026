/** Single source of truth for launch-site + tuning constants. */
export const LAUNCH_ORIGIN = {
  lat: 31.031080142681898,
  lon: -103.5400953745281,
  alt: 0, // meters MSL of the launch pad; adjust if known
} as const;

/** UI render tick rate (Hz). Ingest runs at the source's native rate. */
export const RENDER_HZ = 30;

/** Default mock source update rate (Hz). */
export const MOCK_UPDATE_HZ = 20;

/** How many samples each scrolling chart keeps. */
export const CHART_WINDOW = 600;

/** Velocity dial range (m/s). */
export const VELOCITY_MIN = 0;
export const VELOCITY_MAX = 400;
