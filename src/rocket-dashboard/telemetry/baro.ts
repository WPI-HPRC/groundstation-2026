export const SEA_LEVEL_HPA = 1013.25;

/** Barometric altitude (meters) from pressure (hPa), referenced to sea level. */
export function pressureToAltitude(pressureHpa: number): number {
  if (!Number.isFinite(pressureHpa) || pressureHpa <= 0) return 0;
  return 44330 * (1 - Math.pow(pressureHpa / SEA_LEVEL_HPA, 0.1903));
}
