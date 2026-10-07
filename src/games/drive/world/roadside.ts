import * as THREE from "three";
import type { GameMapDefinition } from "../maps";
import { SpatialGrid } from "./spatial-grid";
import type { Obstacle } from "./types";

type Point = { x: number; z: number };
/** One side of a road: a run of edge points with the outward (off-pavement) normal at each. */
type RoadEdge = { points: Point[]; normals: Point[]; source: "corridor" | "road" };

/** Buildings within this distance of an edge make it an urban street rather than a country road. */
const URBAN_RADIUS = 26;
const SIDEWALK_WIDTH = 2.6;
const SIDEWALK_TOP = 0.15;
const POLE_SPACING = 30;
const POLE_OFFSET = 7;
const POLE_HEIGHT = 7.4;
const FIELD_CELL = 72;

export type RoadsideStats = {
  sidewalkTiles: number;
  tufts: number;
  poles: number;
  chevrons: number;
  fields: number;
};

/**
 * Dresses a map from its existing road network so authored layouts need no extra data:
 * sidewalks and curbs where streets pass buildings, grass tufts and rocks along country
 * roads, utility poles with sagging wires, chevron boards on the outside of sharp bends,
 * and crop fields in large open areas. Tall items collide like other roadside props;
 * ground-level dressing is decorative.
 */
export function addRoadsideDressing(
  scene: THREE.Object3D,
  obstacles: Obstacle[],
  map: GameMapDefinition,
  pavedAt: (x: number, z: number) => boolean,
): RoadsideStats {
  const random = mulberry32(hashString(map.id));
  const buildingGrid = new SpatialGrid(obstacles.filter((obstacle) => obstacle.kind === "building"), 32);
  const solidGrid = new SpatialGrid([...obstacles], 16);
  const placed: Obstacle[] = [];
  const boxes = createBoxBatch();
  const stats: RoadsideStats = { sidewalkTiles: 0, tufts: 0, poles: 0, chevrons: 0, fields: 0 };
  const limit = map.worldLimit - 6;

  const nearBuilding = (x: number, z: number, radius: number) => buildingGrid
    .query(x - radius, x + radius, z - radius, z + radius)
    .some((building) => distanceToBox(x, z, building) <= radius);
  const clear = (x: number, z: number, radius: number) => {
    if (Math.abs(x) > limit || Math.abs(z) > limit) return false;
    const blocking = (obstacle: Obstacle) => distanceToBox(x, z, obstacle) <= radius;
    if (solidGrid.query(x - radius, x + radius, z - radius, z + radius).some(blocking)) return false;
    return !placed.some(blocking);
  };
  const reserve = (obstacle: Obstacle) => {
    placed.push(obstacle);
    obstacles.push(obstacle);
  };

  const edges = collectEdges(map);
  const tufts: Placement[] = [];
  const rocks: Placement[] = [];
  const poles: Placement[] = [];
  const chevrons: Placement[] = [];

  edges.forEach((edge, edgeIndex) => {
    let distanceSincePole = POLE_SPACING * 0.5;
    let previousPole: THREE.Vector3[] | null = null;
    const wantsPoles = edge.source === "corridor" && edgeIndex % 2 === 0;
    for (let index = 1; index < edge.points.length; index++) {
      const start = edge.points[index - 1];
      const end = edge.points[index];
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      if (length < 0.5) continue;
      const tangent = { x: (end.x - start.x) / length, z: (end.z - start.z) / length };
      const normal = edge.normals[index];
      const yaw = Math.atan2(tangent.x, tangent.z);
      for (let along = 0; along < length; along += 3) {
        const x = start.x + tangent.x * along;
        const z = start.z + tangent.z * along;
        const urban = nearBuilding(x + normal.x * 8, z + normal.z * 8, URBAN_RADIUS);
        if (urban) {
          // Sidewalk tile with a raised curb on the street side.
          const tileX = x + normal.x * (SIDEWALK_WIDTH / 2 + 0.25);
          const tileZ = z + normal.z * (SIDEWALK_WIDTH / 2 + 0.25);
          const outerX = x + normal.x * (SIDEWALK_WIDTH + 0.4);
          const outerZ = z + normal.z * (SIDEWALK_WIDTH + 0.4);
          if (!pavedAt(tileX, tileZ) && !pavedAt(outerX, outerZ) && !nearBuilding(tileX, tileZ, 0.6)) {
            const tileLength = Math.min(3.02, length - along);
            const centerAlong = tileLength / 2;
            boxes.add(
              tileX + tangent.x * centerAlong,
              SIDEWALK_TOP / 2,
              tileZ + tangent.z * centerAlong,
              SIDEWALK_WIDTH,
              SIDEWALK_TOP,
              tileLength,
              yaw,
              (Math.floor(along / 3) % 2 === 0) ? 0xa29d86 : 0x9a957f,
            );
            boxes.add(
              x + normal.x * 0.32 + tangent.x * centerAlong,
              0.1,
              z + normal.z * 0.32 + tangent.z * centerAlong,
              0.26,
              0.2,
              tileLength,
              yaw,
              0xb9b39d,
            );
            stats.sidewalkTiles++;
          }
          distanceSincePole = 0;
          previousPole = null;
          continue;
        }
        // Country verge: tufts and the occasional rock break up flat grass and sell speed.
        if (random() < 0.55) {
          const offset = 1.2 + random() * 6;
          const tuftX = x + normal.x * offset + tangent.x * random() * 3;
          const tuftZ = z + normal.z * offset + tangent.z * random() * 3;
          if (!pavedAt(tuftX, tuftZ) && clear(tuftX, tuftZ, 0.6)) {
            (random() < 0.12 ? rocks : tufts).push({
              x: tuftX,
              z: tuftZ,
              yaw: random() * Math.PI * 2,
              scale: 0.55 + random() * 0.4,
            });
            stats.tufts++;
          }
        }
        distanceSincePole += 3;
        if (wantsPoles && distanceSincePole >= POLE_SPACING) {
          const poleX = x + normal.x * POLE_OFFSET;
          const poleZ = z + normal.z * POLE_OFFSET;
          if (!pavedAt(poleX, poleZ) && !pavedAt(poleX - normal.x * 2.5, poleZ - normal.z * 2.5)
            && clear(poleX, poleZ, 2.2)) {
            distanceSincePole = 0;
            poles.push({ x: poleX, z: poleZ, yaw, scale: 1 });
            reserve(pointObstacle("pole", poleX, poleZ, 0.3));
            stats.poles++;
            // Crossarm ends, then sagging wires back to the previous pole on this run.
            const crossX = Math.cos(yaw);
            const crossZ = -Math.sin(yaw);
            const tops = [-1.05, 0, 1.05].map((offset) => new THREE.Vector3(
              poleX + crossX * offset,
              POLE_HEIGHT - 0.35 + (offset === 0 ? 0.55 : 0),
              poleZ + crossZ * offset,
            ));
            if (previousPole && previousPole[1].distanceTo(tops[1]) < POLE_SPACING * 1.6) {
              tops.forEach((top, wire) => boxes.wire(previousPole![wire], top, 0.6, 0x2a2b27));
            }
            previousPole = tops;
          } else {
            previousPole = null;
          }
        }
      }
    }
  });

  // Chevron boards on the outside of sharp bends, facing oncoming traffic.
  for (const corridor of map.corridors ?? []) {
    const points = corridor.points;
    for (let index = 1; index < points.length - 1; index++) {
      const previous = points[index - 1];
      const current = points[index];
      const next = points[index + 1];
      const inHeading = Math.atan2(current.x - previous.x, current.z - previous.z);
      const outHeading = Math.atan2(next.x - current.x, next.z - current.z);
      const turn = angleDifference(inHeading, outHeading);
      if (Math.abs(turn) < THREE.MathUtils.degToRad(28)) continue;
      // A positive turn swings the heading toward its right-hand perpendicular (cos, -sin),
      // so the outside of the bend lies on the opposite side.
      const outsideSign = turn > 0 ? -1 : 1;
      const bisector = inHeading + turn / 2;
      const cornerReach = corridor.width / 2 / Math.max(0.35, Math.cos(turn / 2)) + 3;
      for (const spread of [-0.5, 0, 0.5]) {
        const heading = bisector + spread * turn;
        const x = current.x + Math.cos(heading) * outsideSign * cornerReach;
        const z = current.z - Math.sin(heading) * outsideSign * cornerReach;
        if (pavedAt(x, z) || !clear(x, z, 1.4)) continue;
        // Face back toward the bend's apex so approaching drivers read the arrow.
        const yaw = Math.atan2(current.x - x, current.z - z);
        chevrons.push({ x, z, yaw, scale: turn > 0 ? 1 : -1 });
        reserve(pointObstacle("sign", x, z, 0.25));
        stats.chevrons++;
      }
    }
  }

  stats.fields = addFields(boxes, map, random, pavedAt, nearBuilding, clear);

  addTufts(scene, tufts, rocks);
  addPoles(scene, poles);
  addChevrons(scene, chevrons);
  boxes.flush(scene);
  return stats;
}

type Placement = { x: number; z: number; yaw: number; scale: number };

function collectEdges(map: GameMapDefinition): RoadEdge[] {
  const edges: RoadEdge[] = [];
  for (const corridor of map.corridors ?? []) {
    for (const side of [-1, 1]) {
      const points: Point[] = [];
      const normals: Point[] = [];
      corridor.points.forEach((point, index) => {
        const previous = corridor.points[Math.max(0, index - 1)];
        const next = corridor.points[Math.min(corridor.points.length - 1, index + 1)];
        const dx = next.x - previous.x;
        const dz = next.z - previous.z;
        const length = Math.hypot(dx, dz) || 1;
        const normal = { x: (dz / length) * side, z: (-dx / length) * side };
        points.push({ x: point.x + normal.x * corridor.width / 2, z: point.z + normal.z * corridor.width / 2 });
        normals.push(normal);
      });
      edges.push({ points, normals, source: "corridor" });
    }
  }
  for (const road of map.roads) {
    if (road.role) continue;
    const rotation = road.rotation ?? 0;
    const alongX = road.width >= road.depth;
    const halfLength = (alongX ? road.width : road.depth) / 2;
    const halfWidth = (alongX ? road.depth : road.width) / 2;
    for (const side of [-1, 1]) {
      const localStart = alongX ? { x: -halfLength, z: side * halfWidth } : { x: side * halfWidth, z: -halfLength };
      const localEnd = alongX ? { x: halfLength, z: side * halfWidth } : { x: side * halfWidth, z: halfLength };
      const localNormal = alongX ? { x: 0, z: side } : { x: side, z: 0 };
      const transform = (point: Point) => ({
        x: road.x + Math.cos(rotation) * point.x + Math.sin(rotation) * point.z,
        z: road.z - Math.sin(rotation) * point.x + Math.cos(rotation) * point.z,
      });
      const normal = {
        x: Math.cos(rotation) * localNormal.x + Math.sin(rotation) * localNormal.z,
        z: -Math.sin(rotation) * localNormal.x + Math.cos(rotation) * localNormal.z,
      };
      edges.push({ points: [transform(localStart), transform(localEnd)], normals: [normal, normal], source: "road" });
    }
  }
  return edges;
}

/** Crop and plowed fields laid into large open areas, aligned to a stable grid. */
function addFields(
  boxes: BoxBatch,
  map: GameMapDefinition,
  random: () => number,
  pavedAt: (x: number, z: number) => boolean,
  nearBuilding: (x: number, z: number, radius: number) => boolean,
  clear: (x: number, z: number, radius: number) => boolean,
) {
  const limit = map.worldLimit - 30;
  let fields = 0;
  const palettes = [
    { base: 0x7d8a2e, row: 0x6a7726 },
    { base: 0x8f7a4c, row: 0x7a6640 },
    { base: 0xa59a52, row: 0x928746 },
    { base: 0x6f8a3a, row: 0x5f7731 },
  ];
  for (let cellX = -limit; cellX < limit; cellX += FIELD_CELL) {
    for (let cellZ = -limit; cellZ < limit; cellZ += FIELD_CELL) {
      if (random() > 0.62) continue;
      const width = 30 + random() * 26;
      const depth = 22 + random() * 20;
      const x = cellX + FIELD_CELL / 2 + (random() - 0.5) * 16;
      const z = cellZ + FIELD_CELL / 2 + (random() - 0.5) * 16;
      const rotation = random() < 0.5 ? 0 : Math.PI / 2;
      const halfX = (rotation === 0 ? width : depth) / 2 + 6;
      const halfZ = (rotation === 0 ? depth : width) / 2 + 6;
      // Every sample in and around the footprint must be open ground; a 4-unit lattice is
      // finer than the narrowest road, so no field can straddle pavement.
      let open = true;
      for (let px = x - halfX; px <= x + halfX && open; px += 4) {
        for (let pz = z - halfZ; pz <= z + halfZ && open; pz += 4) {
          if (pavedAt(px, pz) || nearBuilding(px, pz, 6) || !clear(px, pz, 0.2)) open = false;
        }
      }
      if (!open) continue;
      const palette = palettes[Math.floor(random() * palettes.length)];
      boxes.add(x, 0.012, z, width, 0.024, depth, rotation, palette.base);
      const rows = Math.floor(depth / 2.2);
      for (let row = 0; row < rows; row++) {
        const offset = -depth / 2 + 1.1 + row * 2.2;
        boxes.add(
          x + Math.sin(rotation) * offset,
          0.04,
          z + Math.cos(rotation) * offset,
          width - 1.2,
          0.05,
          0.7,
          rotation,
          palette.row,
        );
      }
      fields++;
    }
  }
  return fields;
}

function addTufts(scene: THREE.Object3D, tufts: readonly Placement[], rocks: readonly Placement[]) {
  // Open-ended: the base is never visible and would double the triangle count.
  const tuft = new THREE.ConeGeometry(0.42, 0.75, 4, 1, true);
  addPlacements(scene, tufts, [
    { geometry: tuft, color: 0x627626, matrix: compose(0, 0.2, 0, 0, 1.1, 0.55, 1.1) },
    { geometry: tuft, color: 0x6f852f, matrix: compose(0.38, 0.15, 0.22, 0.6, 0.8, 0.42, 0.8) },
    { geometry: tuft, color: 0x55691f, matrix: compose(-0.34, 0.14, -0.16, 1.2, 0.85, 0.4, 0.85) },
  ], false);
  addPlacements(scene, rocks, [
    { geometry: new THREE.DodecahedronGeometry(0.5, 0), color: 0x8a877b, matrix: compose(0, 0.2, 0, 0, 1.2, 0.6, 0.9) },
  ], true);
}

function addPoles(scene: THREE.Object3D, poles: readonly Placement[]) {
  addPlacements(scene, poles, [
    { geometry: new THREE.CylinderGeometry(0.13, 0.19, POLE_HEIGHT, 6), color: 0x6a5642, matrix: compose(0, POLE_HEIGHT / 2, 0, 0, 1, 1, 1) },
    { geometry: new THREE.BoxGeometry(2.5, 0.14, 0.14), color: 0x5c4a39, matrix: compose(0, POLE_HEIGHT - 0.5, 0, Math.PI / 2, 1, 1, 1) },
    { geometry: new THREE.CylinderGeometry(0.06, 0.08, 0.3, 5), color: 0x9fb3a8, matrix: compose(0, POLE_HEIGHT - 0.28, 1.05, 0, 1, 1, 1) },
    { geometry: new THREE.CylinderGeometry(0.06, 0.08, 0.3, 5), color: 0x9fb3a8, matrix: compose(0, POLE_HEIGHT - 0.28, -1.05, 0, 1, 1, 1) },
    { geometry: new THREE.CylinderGeometry(0.06, 0.08, 0.3, 5), color: 0x9fb3a8, matrix: compose(0, POLE_HEIGHT + 0.25, 0, 0, 1, 1, 1) },
  ], true);
}

function addChevrons(scene: THREE.Object3D, chevrons: readonly Placement[]) {
  const left = chevrons.filter((chevron) => chevron.scale < 0).map((chevron) => ({ ...chevron, scale: 1 }));
  const right = chevrons.filter((chevron) => chevron.scale > 0).map((chevron) => ({ ...chevron, scale: 1 }));
  for (const [group, pointing] of [[left, -1], [right, 1]] as const) {
    addPlacements(scene, group, [
      { geometry: new THREE.CylinderGeometry(0.06, 0.08, 1.6, 5), color: 0x3b4039, matrix: compose(0, 0.8, 0, 0, 1, 1, 1) },
      { geometry: new THREE.BoxGeometry(0.95, 0.85, 0.08), color: 0xe7c142, matrix: compose(0, 1.85, 0, 0, 1, 1, 1) },
      {
        geometry: new THREE.BoxGeometry(0.42, 0.13, 0.1),
        color: 0x1d201c,
        matrix: compose(pointing * 0.06, 2.0, 0, 0, 1, 1, 1, pointing * 0.7),
        basic: true,
      },
      {
        geometry: new THREE.BoxGeometry(0.42, 0.13, 0.1),
        color: 0x1d201c,
        matrix: compose(pointing * 0.06, 1.7, 0, 0, 1, 1, 1, -pointing * 0.7),
        basic: true,
      },
    ], true);
  }
}

type PropPart = { geometry: THREE.BufferGeometry; color: number; matrix: THREE.Matrix4; basic?: boolean };

function addPlacements(
  scene: THREE.Object3D,
  placements: readonly Placement[],
  parts: readonly PropPart[],
  castShadow: boolean,
) {
  if (placements.length === 0) return;
  const placement = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  for (const part of parts) {
    const mesh = new THREE.InstancedMesh(
      part.geometry,
      part.basic
        ? new THREE.MeshBasicMaterial({ color: part.color })
        : new THREE.MeshStandardMaterial({ color: part.color, roughness: 1, flatShading: true }),
      placements.length,
    );
    placements.forEach((entry, index) => {
      placement.compose(
        position.set(entry.x, 0, entry.z),
        quaternion.setFromAxisAngle(UP, entry.yaw),
        scale.setScalar(entry.scale),
      );
      mesh.setMatrixAt(index, matrix.multiplyMatrices(placement, part.matrix));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

type BoxBatch = ReturnType<typeof createBoxBatch>;

/** Arbitrary oriented boxes and wire spans, emitted as one instanced unit box. */
function createBoxBatch() {
  const entries: Array<{ matrix: THREE.Matrix4; color: number; shadow: boolean }> = [];
  const quaternion = new THREE.Quaternion();
  const xAxis = new THREE.Vector3(1, 0, 0);
  return {
    add(x: number, y: number, z: number, width: number, height: number, depth: number, yaw: number, color: number) {
      entries.push({
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, z),
          quaternion.setFromAxisAngle(UP, yaw),
          new THREE.Vector3(width, height, depth),
        ),
        color,
        shadow: false,
      });
    },
    /** A wire hanging between two points, approximated by two straight spans with a sag. */
    wire(from: THREE.Vector3, to: THREE.Vector3, sag: number, color: number) {
      const middle = from.clone().lerp(to, 0.5);
      middle.y -= sag;
      for (const [start, end] of [[from, middle], [middle, to]] as const) {
        const direction = end.clone().sub(start);
        const length = direction.length();
        entries.push({
          matrix: new THREE.Matrix4().compose(
            start.clone().lerp(end, 0.5),
            quaternion.setFromUnitVectors(xAxis, direction.normalize()).clone(),
            new THREE.Vector3(length, 0.04, 0.04),
          ),
          color,
          shadow: false,
        });
      }
    },
    flush(scene: THREE.Object3D) {
      if (entries.length === 0) return;
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }),
        entries.length,
      );
      const tint = new THREE.Color();
      entries.forEach((entry, index) => {
        mesh.setMatrixAt(index, entry.matrix);
        mesh.setColorAt(index, tint.setHex(entry.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      scene.add(mesh);
    },
  };
}

const UP = new THREE.Vector3(0, 1, 0);

function compose(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, roll = 0) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, roll)),
    new THREE.Vector3(sx, sy, sz),
  );
}

function pointObstacle(kind: Obstacle["kind"], x: number, z: number, radius: number): Obstacle {
  return { kind, minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius, resetsCar: true };
}

function distanceToBox(x: number, z: number, box: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  const dx = Math.max(box.minX - x, 0, x - box.maxX);
  const dz = Math.max(box.minZ - z, 0, z - box.maxZ);
  return Math.hypot(dx, dz);
}

function angleDifference(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
