import type { WorldCollision } from "../world/types";

export type DrivingSpawn = { x: number; z: number; heading: number };

/** Numeric map contract consumed by presentation-free vehicle mechanics. */
export interface DrivingWorldQuery {
  readonly spawn: DrivingSpawn;
  isOnPavement(x: number, z: number): boolean;
  queryCollision(x: number, z: number, radius: number): WorldCollision | null;
  isOutsideBoundary(x: number, z: number, radius: number): boolean;
}
