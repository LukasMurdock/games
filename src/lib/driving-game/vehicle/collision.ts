import type * as THREE from "three";

const COLLIDER_OFFSET = 1.05;
const COLLIDER_RADIUS = 1.02;

export type VehicleCollision = {
  normalX: number;
  normalZ: number;
  penetration: number;
};

export function queryVehicleCollision(
  firstPosition: THREE.Vector3,
  firstHeading: number,
  secondPosition: THREE.Vector3,
  secondHeading: number,
): VehicleCollision | null {
  const firstSin = Math.sin(firstHeading);
  const firstCos = Math.cos(firstHeading);
  const secondSin = Math.sin(secondHeading);
  const secondCos = Math.cos(secondHeading);
  let deepestCollision: VehicleCollision | null = null;

  for (const firstOffset of [-COLLIDER_OFFSET, COLLIDER_OFFSET]) {
    const firstX = firstPosition.x + firstSin * firstOffset;
    const firstZ = firstPosition.z + firstCos * firstOffset;
    for (const secondOffset of [-COLLIDER_OFFSET, COLLIDER_OFFSET]) {
      let dx = firstX - (secondPosition.x + secondSin * secondOffset);
      let dz = firstZ - (secondPosition.z + secondCos * secondOffset);
      let distanceSq = dx * dx + dz * dz;
      const minimumDistance = COLLIDER_RADIUS * 2;
      if (distanceSq >= minimumDistance * minimumDistance) continue;
      if (distanceSq < 0.000001) {
        dx = firstPosition.x - secondPosition.x;
        dz = firstPosition.z - secondPosition.z;
        distanceSq = dx * dx + dz * dz;
        if (distanceSq < 0.000001) {
          dx = Math.cos(firstHeading);
          dz = -Math.sin(firstHeading);
          distanceSq = 1;
        }
      }

      const distance = Math.sqrt(distanceSq);
      const collision = {
        normalX: dx / distance,
        normalZ: dz / distance,
        penetration: minimumDistance - distance,
      };
      if (!deepestCollision || collision.penetration > deepestCollision.penetration) {
        deepestCollision = collision;
      }
    }
  }
  return deepestCollision;
}
