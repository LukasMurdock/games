import type { ParkingLotDefinition, RoadCorridorDefinition, RoadSegmentDefinition } from "../maps/types";
import type { SpatialBounds } from "./spatial-grid";

export type PavementPrimitive = SpatialBounds & (
  | { kind: "oriented-rect"; x: number; z: number; halfWidth: number; halfDepth: number; rotation: number }
  | { kind: "capsule"; startX: number; startZ: number; endX: number; endZ: number; radius: number }
  | { kind: "circle"; x: number; z: number; radius: number }
);

export function roadPavement(road: RoadSegmentDefinition): PavementPrimitive {
  return orientedRectangle(road.x, road.z, road.width, road.depth, road.rotation ?? 0);
}

export function parkingPavement(lot: ParkingLotDefinition): PavementPrimitive {
  return orientedRectangle(lot.x, lot.z, lot.width, lot.depth, lot.rotation ?? 0);
}

export function corridorPavement(corridor: RoadCorridorDefinition): PavementPrimitive[] {
  const primitives: PavementPrimitive[] = [];
  const radius = corridor.width / 2;
  for (let index = 1; index < corridor.points.length; index++) {
    const start = corridor.points[index - 1];
    const end = corridor.points[index];
    primitives.push({
      kind: "capsule",
      startX: start.x,
      startZ: start.z,
      endX: end.x,
      endZ: end.z,
      radius,
      minX: Math.min(start.x, end.x) - radius,
      maxX: Math.max(start.x, end.x) + radius,
      minZ: Math.min(start.z, end.z) - radius,
      maxZ: Math.max(start.z, end.z) + radius,
    });
  }
  return primitives;
}

export function circlePavement(x: number, z: number, radius: number): PavementPrimitive {
  return {
    kind: "circle",
    x,
    z,
    radius,
    minX: x - radius,
    maxX: x + radius,
    minZ: z - radius,
    maxZ: z + radius,
  };
}

export function containsPavement(primitive: PavementPrimitive, x: number, z: number) {
  if (primitive.kind === "circle") {
    return (x - primitive.x) ** 2 + (z - primitive.z) ** 2 <= primitive.radius ** 2;
  }
  if (primitive.kind === "capsule") {
    return distanceToSegmentSquared(
      x,
      z,
      primitive.startX,
      primitive.startZ,
      primitive.endX,
      primitive.endZ,
    ) <= primitive.radius ** 2;
  }
  const dx = x - primitive.x;
  const dz = z - primitive.z;
  const localX = Math.cos(primitive.rotation) * dx - Math.sin(primitive.rotation) * dz;
  const localZ = Math.sin(primitive.rotation) * dx + Math.cos(primitive.rotation) * dz;
  return Math.abs(localX) <= primitive.halfWidth && Math.abs(localZ) <= primitive.halfDepth;
}

function orientedRectangle(x: number, z: number, width: number, depth: number, rotation: number): PavementPrimitive {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const extentX = Math.abs(Math.cos(rotation)) * halfWidth + Math.abs(Math.sin(rotation)) * halfDepth;
  const extentZ = Math.abs(Math.sin(rotation)) * halfWidth + Math.abs(Math.cos(rotation)) * halfDepth;
  return {
    kind: "oriented-rect",
    x,
    z,
    halfWidth,
    halfDepth,
    rotation,
    minX: x - extentX,
    maxX: x + extentX,
    minZ: z - extentZ,
    maxZ: z + extentZ,
  };
}

function distanceToSegmentSquared(
  x: number,
  z: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
) {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return (x - startX) ** 2 + (z - startZ) ** 2;
  const amount = Math.max(0, Math.min(1, ((x - startX) * dx + (z - startZ) * dz) / lengthSquared));
  const closestX = startX + dx * amount;
  const closestZ = startZ + dz * amount;
  return (x - closestX) ** 2 + (z - closestZ) ** 2;
}
