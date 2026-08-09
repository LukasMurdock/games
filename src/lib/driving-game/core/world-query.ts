import * as THREE from "three";
import type { WorldCollision, WorldRuntime } from "../world/types";

export type DrivingSpawn = { x: number; z: number; heading: number };

export interface DrivingWorldQuery {
  readonly spawn: DrivingSpawn;
  isOnPavement(x: number, z: number): boolean;
  queryCollision(x: number, z: number, radius: number): WorldCollision | null;
  isOutsideBoundary(x: number, z: number, radius: number): boolean;
}

/** Keeps the vehicle simulation dependent on numeric world queries rather than renderer objects. */
export function createDrivingWorldQuery(world: WorldRuntime): DrivingWorldQuery {
  const queryPoint = new THREE.Vector3();
  const at = (x: number, z: number) => queryPoint.set(x, 0, z);
  return {
    spawn: {
      x: world.spawnPosition.x,
      z: world.spawnPosition.z,
      heading: world.spawnHeading,
    },
    isOnPavement: (x, z) => world.isOnPavement(at(x, z)),
    queryCollision: (x, z, radius) => world.queryCollision(at(x, z), radius),
    isOutsideBoundary: (x, z, radius) => world.isOutsideBoundary(at(x, z), radius),
  };
}
