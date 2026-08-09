import * as THREE from "three";
import type { GameMapDefinition } from "../maps";
import type { PavementPrimitive } from "./pavement";
import type { Obstacle, WorldDebugLayer } from "./types";

const DEBUG_Y = 0.42;

export function createWorldDebugLayers(options: {
  map: GameMapDefinition;
  obstacles: readonly Obstacle[];
  pavement: readonly PavementPrimitive[];
  occupiedCells: readonly { x: number; z: number }[];
  cellSize: number;
}) {
  const root = new THREE.Group();
  root.name = "map-debug";
  const layers = new Map<WorldDebugLayer, THREE.Object3D>();

  const pavement = createPavementDebug(options.pavement);
  const colliders = createObstacleDebug(options.obstacles);
  const grid = createGridDebug(options.occupiedCells, options.cellSize);
  const source = createSourceDebug(options.map);
  const districts = createDistrictDebug(options.map);
  for (const [name, layer] of [
    ["pavement", pavement],
    ["colliders", colliders],
    ["grid", grid],
    ["source", source],
    ["districts", districts],
  ] as const) {
    layer.name = `map-debug:${name}`;
    layer.visible = false;
    layers.set(name, layer);
    root.add(layer);
  }
  return { root, layers };
}

function createPavementDebug(primitives: readonly PavementPrimitive[]) {
  const instances = debugInstances(primitives.length, 0x59d7e8);
  const matrix = new THREE.Matrix4();
  primitives.forEach((primitive, index) => {
    if (primitive.kind === "oriented-rect") {
      setDebugMatrix(
        matrix,
        primitive.x,
        primitive.z,
        primitive.halfWidth * 2,
        primitive.halfDepth * 2,
        primitive.rotation,
      );
    } else if (primitive.kind === "circle") {
      setDebugMatrix(matrix, primitive.x, primitive.z, primitive.radius * 2, primitive.radius * 2, 0);
    } else {
      const dx = primitive.endX - primitive.startX;
      const dz = primitive.endZ - primitive.startZ;
      setDebugMatrix(
        matrix,
        (primitive.startX + primitive.endX) / 2,
        (primitive.startZ + primitive.endZ) / 2,
        primitive.radius * 2,
        Math.hypot(dx, dz) + primitive.radius * 2,
        Math.atan2(dx, dz),
      );
    }
    instances.setMatrixAt(index, matrix);
  });
  finishDebugInstances(instances);
  return instances;
}

function createObstacleDebug(obstacles: readonly Obstacle[]) {
  const instances = debugInstances(obstacles.length, 0xef6558);
  const matrix = new THREE.Matrix4();
  obstacles.forEach((obstacle, index) => {
    const box = obstacle.orientedBox;
    setDebugMatrix(
      matrix,
      box?.x ?? (obstacle.minX + obstacle.maxX) / 2,
      box?.z ?? (obstacle.minZ + obstacle.maxZ) / 2,
      box ? box.halfWidth * 2 : obstacle.maxX - obstacle.minX,
      box ? box.halfDepth * 2 : obstacle.maxZ - obstacle.minZ,
      box?.rotation ?? 0,
    );
    instances.setMatrixAt(index, matrix);
  });
  finishDebugInstances(instances);
  return instances;
}

function createGridDebug(cells: readonly { x: number; z: number }[], cellSize: number) {
  const instances = debugInstances(cells.length, 0xf0d35c, 0.34);
  const matrix = new THREE.Matrix4();
  cells.forEach((cell, index) => {
    setDebugMatrix(
      matrix,
      (cell.x + 0.5) * cellSize,
      (cell.z + 0.5) * cellSize,
      cellSize,
      cellSize,
      0,
    );
    instances.setMatrixAt(index, matrix);
  });
  finishDebugInstances(instances);
  return instances;
}

function createSourceDebug(map: GameMapDefinition) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false });
  for (const corridor of map.corridors ?? []) {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      corridor.points.map((point) => new THREE.Vector3(point.x, DEBUG_Y + 0.05, point.z)),
    );
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 20;
    group.add(line);
  }
  return group;
}

function createDistrictDebug(map: GameMapDefinition) {
  const districts = map.compiledDistricts ?? [];
  const instances = debugInstances(districts.length, 0xb66ff0, 0.8);
  const matrix = new THREE.Matrix4();
  districts.forEach((district, index) => {
    setDebugMatrix(
      matrix,
      (district.bounds.minX + district.bounds.maxX) / 2,
      (district.bounds.minZ + district.bounds.maxZ) / 2,
      district.bounds.maxX - district.bounds.minX,
      district.bounds.maxZ - district.bounds.minZ,
      0,
    );
    instances.setMatrixAt(index, matrix);
  });
  finishDebugInstances(instances);
  return instances;
}

function debugInstances(count: number, color: number, opacity = 0.72) {
  const material = new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    opacity,
    transparent: true,
    wireframe: true,
  });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 1), material, count);
  mesh.renderOrder = 20;
  return mesh;
}

function setDebugMatrix(
  matrix: THREE.Matrix4,
  x: number,
  z: number,
  width: number,
  depth: number,
  rotation: number,
) {
  matrix.compose(
    new THREE.Vector3(x, DEBUG_Y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
    new THREE.Vector3(width, 1, depth),
  );
}

function finishDebugInstances(instances: THREE.InstancedMesh) {
  instances.instanceMatrix.needsUpdate = true;
  instances.computeBoundingSphere();
}
