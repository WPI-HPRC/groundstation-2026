import type { Quat } from "./types";

/** Returns [x, y, z, w] for THREE.Quaternion.set(...). EKF i,j,k -> x,y,z. */
export function quatToThree(q: Quat): [number, number, number, number] {
  return [q.i, q.j, q.k, q.w];
}
