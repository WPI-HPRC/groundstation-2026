export type Vec3 = { x: number; y: number; z: number };
export type Geodetic = { lat: number; lon: number; alt?: number };

const WGS84_A = 6378137; // equatorial radius (m)
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Convert a local ENU offset (meters, x=East y=North z=Up) to lat/lon/alt anchored at
 * `origin`. Equirectangular small-area approximation, valid for the few-km scale of a
 * launch. NO dashboard imports — this file is portable on its own.
 *
 * AXIS ASSUMPTION: x=East, y=North, z=Up. If a consumer's EKF uses NED or another order,
 * convert before calling, or change ONLY this function in your copy.
 */
export function enuToGeodetic(p: Vec3, origin: Geodetic): Geodetic {
  const dLat = p.y / WGS84_A;
  const dLon = p.x / (WGS84_A * Math.cos(rad(origin.lat)));
  return {
    lat: origin.lat + deg(dLat),
    lon: origin.lon + deg(dLon),
    alt: (origin.alt ?? 0) + p.z,
  };
}
