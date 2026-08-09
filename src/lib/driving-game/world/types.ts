import type * as THREE from "three";

export type ObstacleKind = "building" | "tree" | "streetlight" | "barrier" | "sign";

export type Obstacle = {
  kind: ObstacleKind;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  orientedBox?: {
    x: number;
    z: number;
    halfWidth: number;
    halfDepth: number;
    rotation: number;
  };
  resetsCar?: boolean;
};

export type WorldCollision = {
  kind: ObstacleKind;
  normalX: number;
  normalZ: number;
  penetration: number;
  resetsCar: boolean;
};

export type WorldDiagnostics = {
  buildMilliseconds: number;
  obstacles: number;
  pavementPrimitives: number;
  junctions: number;
  accessRoads: number;
  collisionQueries: number;
  collisionCandidates: number;
  pavementQueries: number;
  pavementCandidates: number;
};

export type WorldDebugLayer = "pavement" | "colliders" | "grid" | "source" | "districts";

export type WorldRuntime = {
  spawnPosition: THREE.Vector3;
  spawnHeading: number;
  isOnPavement: (position: THREE.Vector3) => boolean;
  queryCollision: (position: THREE.Vector3, radius: number) => WorldCollision | null;
  findSafePlacement: (candidates: readonly THREE.Vector3[], radius: number) => THREE.Vector3 | null;
  isOutsideBoundary: (position: THREE.Vector3, radius: number) => boolean;
  getDiagnostics: () => Readonly<WorldDiagnostics>;
  setDebugLayer: (layer: WorldDebugLayer, visible: boolean) => void;
  destroy: () => void;
};
