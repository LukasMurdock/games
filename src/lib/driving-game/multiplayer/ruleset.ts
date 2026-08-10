import type { DrivingWorldQuery } from "../core/world-query";
import { DRIVING_PROFILES } from "../driving-profiles";
import type { AuthoritativeDrivingConfig } from "./simulation";

export const PRODUCTION_DRIVING_COMPOSITION = {
  mapId: "city-circuit",
  modeId: "cruise",
  profileId: "loose",
  controlMode: "automatic",
  tickRate: 60,
  snapshotRate: 20,
} as const;

export function createProductionDrivingConfig(world: DrivingWorldQuery): AuthoritativeDrivingConfig {
  return createMultiplayerDrivingConfig(world, PRODUCTION_DRIVING_COMPOSITION.mapId);
}

export function createMultiplayerDrivingConfig(
  world: DrivingWorldQuery,
  mapId: string,
): AuthoritativeDrivingConfig {
  const spawns = createStartingGrid(world);
  for (const spawn of spawns) {
    if (!world.isOnPavement(spawn.x, spawn.z) || world.queryCollision(spawn.x, spawn.z, 1.25)) {
      throw new Error(`${mapId} multiplayer starting grid is not clear pavement.`);
    }
  }
  return {
    world,
    profile: DRIVING_PROFILES[PRODUCTION_DRIVING_COMPOSITION.profileId],
    controlMode: PRODUCTION_DRIVING_COMPOSITION.controlMode,
    mapId,
    modeId: PRODUCTION_DRIVING_COMPOSITION.modeId,
    profileId: PRODUCTION_DRIVING_COMPOSITION.profileId,
    spawns,
  };
}

export function createStartingGrid(world: DrivingWorldQuery) {
  const { x, z, heading } = world.spawn;
  const forwardX = Math.sin(heading);
  const forwardZ = Math.cos(heading);
  const rightX = forwardZ;
  const rightZ = -forwardX;
  return Array.from({ length: 8 }, (_, index) => {
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    return {
      x: x + rightX * side * 1.5 - forwardX * row * 4,
      z: z + rightZ * side * 1.5 - forwardZ * row * 4,
      heading,
    };
  });
}
