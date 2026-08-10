import * as THREE from "three";
import type { DrivingWorldQuery } from "../core/world-query";
import type { WorldRuntime } from "./types";

/** Adapts the rendered local world to the simulation's numeric query contract. */
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
