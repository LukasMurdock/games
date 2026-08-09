import * as THREE from "three";
import type { GameMapDefinition } from "../maps";
import type { CircuitPhrase, PlacementArea } from "../maps/types";
import { addBoundaryFence } from "./boundary-fence";
import { addBuilding } from "./buildings";
import { createWorldDebugLayers } from "./debug-geometry";
import { circlePavement, containsPavement, corridorPavement, parkingPavement, roadPavement } from "./pavement";
import { addBarrierBatch, addSignBatch, addStreetlightBatch, addTreeBatch } from "./props";
import {
  addJunctionBatch,
  addMarkingBatch,
  compileCorridorJunctions,
  corridorMarks,
  createCorridorMesh,
  type RoadMarkDefinition,
} from "./roads";
import { SpatialGrid } from "./spatial-grid";
import type { Obstacle, WorldCollision, WorldDiagnostics, WorldRuntime } from "./types";

export type { Obstacle, WorldRuntime } from "./types";

const UP = new THREE.Vector3(0, 1, 0);


function createFacetedGround(size: number, baseColor: number) {
  const subdivisions = THREE.MathUtils.clamp(Math.ceil(size / 25), 14, 48);
  const geometry = new THREE.PlaneGeometry(size, size, subdivisions, subdivisions).toNonIndexed();
  const position = geometry.getAttribute("position");
  const colors: number[] = [];
  let randomState = 0x52a93f17;
  const random = () => {
    randomState = (1664525 * randomState + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  for (let vertex = 0; vertex < position.count; vertex += 3) {
    const color = new THREE.Color(baseColor);
    color.offsetHSL((random() - 0.5) * 0.008, (random() - 0.5) * 0.02, (random() - 0.5) * 0.025);
    for (let corner = 0; corner < 3; corner++) colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

export function buildWorld(
  scene: THREE.Scene,
  map: GameMapDefinition,
  options: { debug?: boolean } = {},
): WorldRuntime {
  const buildStarted = performance.now();
  const obstacles: Obstacle[] = [];
  const worldRoot = new THREE.Group();
  worldRoot.name = `world:${map.id}`;
  scene.add(worldRoot);
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    vertexColors: true,
    flatShading: true,
  });
  const ground = new THREE.Mesh(createFacetedGround(map.groundSize, map.environment.grass), grassMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  worldRoot.add(ground);
  const patchMaterials = new Map<number, THREE.Material>();
  for (const patch of map.groundPatches ?? []) {
    let material = patchMaterials.get(patch.color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: patch.color, roughness: 1, flatShading: true });
      patchMaterials.set(patch.color, material);
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(patch.width, 0.018, patch.depth), material);
    mesh.position.set(patch.x, 0.004, patch.z);
    mesh.rotation.y = patch.rotation ?? 0;
    mesh.receiveShadow = true;
    worldRoot.add(mesh);
  }
  addBoundaryFence(worldRoot, map.worldLimit);

  const roadMaterial = new THREE.MeshStandardMaterial({
    color: map.environment.road,
    roughness: 1,
    flatShading: true,
  });
  const roadSegments = map.roads;
  const corridors = map.corridors ?? [];
  const corridorJunctions = compileCorridorJunctions(corridors);
  const course = map.circuit ? buildDriftCircuit(worldRoot, roadMaterial, map.circuit) : null;
  const roadMarks: RoadMarkDefinition[] = [];
  const taxiwayMarks: RoadMarkDefinition[] = [];
  const parkingMarks: RoadMarkDefinition[] = [];

  roadSegments.forEach((road, roadIndex) => {
    const material = road.surfaceColor === undefined
      ? roadMaterial
      : new THREE.MeshStandardMaterial({ color: road.surfaceColor, roughness: 1, flatShading: true });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(road.width, 0.12, road.depth), material);
    const roadTop = road.role ? 0.116 + roadIndex * 0.001 : 0.1 + roadIndex * 0.002;
    mesh.position.set(road.x, roadTop - 0.06, road.z);
    mesh.rotation.y = road.rotation ?? 0;
    mesh.receiveShadow = true;
    worldRoot.add(mesh);
    if (road.markings === "taxiway") {
      taxiwayMarks.push(...taxiwayMarkDefinitions(road));
      return;
    }
    if (!road.markings || road.rotation) return;
    if (road.width >= road.depth) {
      for (let x = road.x - road.width / 2 + 5; x <= road.x + road.width / 2 - 5; x += 7) {
        roadMarks.push(
          { x, z: road.z - 0.22, width: 3.3, depth: 0.1 },
          { x, z: road.z + 0.22, width: 3.3, depth: 0.1 },
        );
      }
    } else {
      for (let z = road.z - road.depth / 2 + 5; z <= road.z + road.depth / 2 - 5; z += 7) {
        roadMarks.push(
          { x: road.x - 0.22, z, width: 0.1, depth: 3.3 },
          { x: road.x + 0.22, z, width: 0.1, depth: 3.3 },
        );
      }
    }
  });

  corridors.forEach((corridor, corridorIndex) => {
    const material = corridor.surfaceColor === undefined
      ? roadMaterial
      : new THREE.MeshStandardMaterial({ color: corridor.surfaceColor, roughness: 1, flatShading: true });
    // Junction cuts remove the crossing portion of each strip. The tiny deterministic
    // offset only keeps independent non-junction surfaces visually stable.
    worldRoot.add(createCorridorMesh(
      corridor,
      material,
      0.105 + corridorIndex * 0.003,
      corridorJunctions,
    ));
    const marks = corridorMarks(corridor, corridorJunctions);
    if (corridor.markings === "taxiway") taxiwayMarks.push(...marks);
    else roadMarks.push(...marks);
  });

  addJunctionBatch(
    worldRoot,
    corridorJunctions,
    corridors,
    roadMaterial,
    0.105 + corridors.length * 0.003 + 0.004,
  );

  const concreteMaterial = new THREE.MeshStandardMaterial({ color: 0xaaa58a, roughness: 1, flatShading: true });
  const shoulderMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(map.environment.grass).lerp(new THREE.Color(map.environment.road), 0.28),
    roughness: 1,
    flatShading: true,
  });
  map.parkingLots.forEach((parkingLot) => {
    const rotation = parkingLot.rotation ?? 0;
    const shoulder = new THREE.Mesh(
      new THREE.BoxGeometry(parkingLot.width + 4.2, 0.025, parkingLot.depth + 4.2),
      shoulderMaterial,
    );
    shoulder.position.set(parkingLot.x, 0.017, parkingLot.z);
    shoulder.rotation.y = rotation;
    shoulder.receiveShadow = true;
    worldRoot.add(shoulder);
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(parkingLot.width + 1.4, 0.1, parkingLot.depth + 1.4),
      concreteMaterial,
    );
    curb.position.set(parkingLot.x, 0.045, parkingLot.z);
    curb.rotation.y = rotation;
    curb.receiveShadow = true;
    worldRoot.add(curb);
    const lot = new THREE.Mesh(new THREE.BoxGeometry(parkingLot.width, 0.04, parkingLot.depth), roadMaterial);
    lot.position.set(parkingLot.x, 0.09, parkingLot.z);
    lot.rotation.y = rotation;
    lot.receiveShadow = true;
    worldRoot.add(lot);
    for (let offset = -parkingLot.width / 2 + 2.3; offset < parkingLot.width / 2 - 1; offset += 3.1) {
      for (const localZ of [-parkingLot.depth / 2 + 2.1, parkingLot.depth / 2 - 2.1]) {
        const mark = transformedMark(parkingLot.x, parkingLot.z, offset, localZ, 0.09, 3.6, rotation);
        if (!parkingMarkBlocked(mark, map, roadSegments, corridors)) parkingMarks.push(mark);
      }
    }
  });

  addMarkingBatch(worldRoot, roadMarks, new THREE.MeshBasicMaterial({ color: 0xe4bd42 }), "road-markings");
  addMarkingBatch(worldRoot, taxiwayMarks, new THREE.MeshBasicMaterial({
    color: 0xd8cda4,
    opacity: 0.62,
    transparent: true,
    depthWrite: false,
  }), "taxiway-markings");
  addMarkingBatch(worldRoot, parkingMarks, new THREE.MeshBasicMaterial({ color: 0xd8d7b8 }), "parking-markings");
  const districtMarkings = new Map<number, RoadMarkDefinition[]>();
  for (const marking of map.districtMarkings ?? []) {
    const color = marking.color ?? 0xe5d8a8;
    const batch = districtMarkings.get(color) ?? [];
    batch.push(marking);
    districtMarkings.set(color, batch);
  }
  districtMarkings.forEach((marks, color) => addMarkingBatch(
    worldRoot,
    marks,
    new THREE.MeshBasicMaterial({ color }),
    `district-markings:${color.toString(16)}`,
  ));

  map.buildings.forEach((building) => addBuilding(
    worldRoot,
    obstacles,
    building.x,
    building.z,
    building.width,
    building.depth,
    building.height,
    building.color,
    building.style,
    building.rotation,
  ));
  forEachSpatialChunk(map.trees, (points) => addTreeBatch(worldRoot, obstacles, points));
  forEachSpatialChunk(map.streetlights, (points) => addStreetlightBatch(worldRoot, obstacles, points));
  forEachSpatialChunk(map.barriers, (points) => addBarrierBatch(worldRoot, obstacles, points));
  addSignBatch(worldRoot, obstacles, map.signs ?? []);

  let spawnPosition: THREE.Vector3;
  let spawnHeading: number;
  if (map.spawn.source === "circuit") {
    if (!course) throw new Error(`Map "${map.id}" uses a circuit spawn without defining a circuit.`);
    const sampleIndex = map.spawn.sampleIndex ?? 0;
    spawnPosition = course.points[sampleIndex].clone();
    const spawnTangent = course.tangents[sampleIndex];
    spawnHeading = Math.atan2(spawnTangent.x, spawnTangent.z);
  } else {
    spawnPosition = new THREE.Vector3(map.spawn.x, 0.06, map.spawn.z);
    spawnHeading = map.spawn.heading;
  }
  spawnPosition.y = 0.06;

  const pavementPrimitives = [
    ...roadSegments.map(roadPavement),
    ...corridors.flatMap(corridorPavement),
    ...corridorJunctions.map((junction) => circlePavement(junction.x, junction.z, junction.radius)),
    ...map.parkingLots.map(parkingPavement),
    ...(course?.points.map((point, index) => circlePavement(
      point.x,
      point.z,
      course.widths[index] / 2,
    )) ?? []),
  ];
  const obstacleGrid = new SpatialGrid(obstacles);
  const pavementGrid = new SpatialGrid(pavementPrimitives);
  const occupiedCells = new Map<string, { x: number; z: number }>();
  for (const cell of [...obstacleGrid.getOccupiedCells(), ...pavementGrid.getOccupiedCells()]) {
    occupiedCells.set(`${cell.x}:${cell.z}`, cell);
  }
  const debugLayers = options.debug
    ? createWorldDebugLayers({
        map,
        obstacles,
        pavement: pavementPrimitives,
        occupiedCells: [...occupiedCells.values()],
        cellSize: obstacleGrid.cellSize,
      })
    : null;
  if (debugLayers) worldRoot.add(debugLayers.root);
  const diagnostics: WorldDiagnostics = {
    buildMilliseconds: performance.now() - buildStarted,
    obstacles: obstacles.length,
    pavementPrimitives: pavementPrimitives.length,
    junctions: corridorJunctions.length,
    accessRoads: roadSegments.filter((road) => road.role === "access").length,
    collisionQueries: 0,
    collisionCandidates: 0,
    pavementQueries: 0,
    pavementCandidates: 0,
  };

  return {
    spawnPosition,
    spawnHeading,
    isOnPavement(position: THREE.Vector3) {
      diagnostics.pavementQueries++;
      const candidates = pavementGrid.query(position.x, position.x, position.z, position.z);
      diagnostics.pavementCandidates += candidates.length;
      return candidates.some((primitive) => containsPavement(primitive, position.x, position.z));
    },
    queryCollision(position: THREE.Vector3, radius: number) {
      diagnostics.collisionQueries++;
      const candidates = obstacleGrid.query(
        position.x - radius,
        position.x + radius,
        position.z - radius,
        position.z + radius,
      );
      diagnostics.collisionCandidates += candidates.length;
      let result: WorldCollision | null = null;
      for (const obstacle of candidates) {
        const collision = collideCircleWithObstacle(position.x, position.z, radius, obstacle);
        if (collision && (!result || collision.penetration > result.penetration)) result = collision;
      }
      return result;
    },
    findSafePlacement(candidates: readonly THREE.Vector3[], radius: number) {
      const noSpawnAreas = map.chasePlacement?.noSpawnAreas ?? [];
      const preferredAreas = map.chasePlacement?.preferredAreas ?? [];
      const valid = candidates.filter((candidate) => (
        !isOutsideMapBoundary(map, candidate, radius)
        && !this.queryCollision(candidate, radius)
        && !noSpawnAreas.some((area) => containsPlacementArea(area, candidate.x, candidate.z))
      ));
      const preferred = valid.find((candidate) => (
        preferredAreas.some((area) => containsPlacementArea(area, candidate.x, candidate.z))
        && this.isOnPavement(candidate)
      ));
      const paved = valid.find((candidate) => this.isOnPavement(candidate));
      return (preferred ?? paved ?? valid[0])?.clone() ?? null;
    },
    isOutsideBoundary(position: THREE.Vector3, radius: number) {
      return isOutsideMapBoundary(map, position, radius);
    },
    getDiagnostics() {
      return { ...diagnostics };
    },
    setDebugLayer(layer, visible) {
      const object = debugLayers?.layers.get(layer);
      if (object) object.visible = visible;
    },
    destroy() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      worldRoot.traverse((object) => {
        if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line)) return;
        if (object instanceof THREE.InstancedMesh) object.dispose();
        geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.forEach((material) => materials.add(material));
      });
      scene.remove(worldRoot);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      obstacleGrid.clear();
      pavementGrid.clear();
      obstacles.length = 0;
      pavementPrimitives.length = 0;
    },
  };
}

function isOutsideMapBoundary(map: GameMapDefinition, position: THREE.Vector3, radius: number) {
  const limit = map.worldLimit - radius;
  return Math.abs(position.x) > limit || Math.abs(position.z) > limit;
}

function containsPlacementArea(area: PlacementArea, x: number, z: number) {
  if (area.kind === "circle") return (x - area.x) ** 2 + (z - area.z) ** 2 <= area.radius ** 2;
  const rotation = area.rotation ?? 0;
  const dx = x - area.x;
  const dz = z - area.z;
  const localX = Math.cos(rotation) * dx - Math.sin(rotation) * dz;
  const localZ = Math.sin(rotation) * dx + Math.cos(rotation) * dz;
  return Math.abs(localX) <= area.width / 2 && Math.abs(localZ) <= area.depth / 2;
}

function collideCircleWithObstacle(
  x: number,
  z: number,
  radius: number,
  obstacle: Obstacle,
): WorldCollision | null {
  const box = obstacle.orientedBox;
  const rotation = box?.rotation ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dxFromCenter = box ? x - box.x : 0;
  const dzFromCenter = box ? z - box.z : 0;
  const localX = box ? cos * dxFromCenter - sin * dzFromCenter : x;
  const localZ = box ? sin * dxFromCenter + cos * dzFromCenter : z;
  const minX = box ? -box.halfWidth : obstacle.minX;
  const maxX = box ? box.halfWidth : obstacle.maxX;
  const minZ = box ? -box.halfDepth : obstacle.minZ;
  const maxZ = box ? box.halfDepth : obstacle.maxZ;
  const closestX = THREE.MathUtils.clamp(localX, minX, maxX);
  const closestZ = THREE.MathUtils.clamp(localZ, minZ, maxZ);
  let normalX = localX - closestX;
  let normalZ = localZ - closestZ;
  const distanceSq = normalX * normalX + normalZ * normalZ;
  if (distanceSq >= radius * radius) return null;

  let penetration: number;
  if (distanceSq < 0.0001) {
    const nearestEdge = [
      { distance: Math.abs(localX - minX), x: -1, z: 0 },
      { distance: Math.abs(maxX - localX), x: 1, z: 0 },
      { distance: Math.abs(localZ - minZ), x: 0, z: -1 },
      { distance: Math.abs(maxZ - localZ), x: 0, z: 1 },
    ].sort((a, b) => a.distance - b.distance)[0];
    normalX = nearestEdge.x;
    normalZ = nearestEdge.z;
    penetration = radius + nearestEdge.distance;
  } else {
    const distance = Math.sqrt(distanceSq);
    normalX /= distance;
    normalZ /= distance;
    penetration = radius - distance;
  }

  return {
    kind: obstacle.kind,
    normalX: box ? cos * normalX + sin * normalZ : normalX,
    normalZ: box ? -sin * normalX + cos * normalZ : normalZ,
    penetration,
    resetsCar: obstacle.resetsCar === true,
  };
}

function buildDriftCircuit(
  scene: THREE.Object3D,
  roadMaterial: THREE.Material,
  grammar: readonly CircuitPhrase[],
) {
  // The map's grammar controls rhythm around a guaranteed non-intersecting polar loop.
  // Radius changes create linked transitions; angular spacing controls how long the player has to set and recover.

  const totalSpan = grammar.reduce((sum, phrase) => sum + phrase.span, 0);
  let angle = -Math.PI / 2;
  const anchors: THREE.Vector3[] = [];
  for (const phrase of grammar) {
    anchors.push(new THREE.Vector3(Math.cos(angle) * phrase.radius, 0.105, Math.sin(angle) * phrase.radius));
    angle += phrase.span / totalSpan * Math.PI * 2;
  }

  const curve = new THREE.CatmullRomCurve3(anchors, true, "centripetal", 0.5);
  const sampleCount = 336;
  const points: THREE.Vector3[] = [];
  const tangents: THREE.Vector3[] = [];
  const widths: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    points.push(curve.getPointAt(t));
    tangents.push(curve.getTangentAt(t).setY(0).normalize());
    const phrasePosition = t * grammar.length;
    const phraseIndex = Math.floor(phrasePosition) % grammar.length;
    const nextIndex = (phraseIndex + 1) % grammar.length;
    widths.push(THREE.MathUtils.lerp(grammar[phraseIndex].width, grammar[nextIndex].width, phrasePosition % 1));
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const point = points[i];
    const tangent = tangents[i];
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x);
    const halfWidth = widths[i] / 2;
    const edgeA = point.clone().addScaledVector(right, halfWidth);
    const edgeB = point.clone().addScaledVector(right, -halfWidth);
    positions.push(edgeA.x, edgeA.y, edgeA.z, edgeB.x, edgeB.y, edgeB.z);
    uvs.push(0, i / 12, 1, i / 12);

    const next = (i + 1) % sampleCount;
    const a = i * 2;
    const b = a + 1;
    const c = next * 2;
    const d = c + 1;
    indices.push(a, b, d, a, d, c);
  }

  const roadGeometry = new THREE.BufferGeometry();
  roadGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  roadGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  roadGeometry.setIndex(indices);
  roadGeometry.computeVertexNormals();
  const road = new THREE.Mesh(roadGeometry, roadMaterial);
  road.receiveShadow = true;
  scene.add(road);

  const markerMatrix = new THREE.Matrix4();
  const markerQuaternion = new THREE.Quaternion();
  const markerScale = new THREE.Vector3(1, 1, 1);

  // Alternating curbs make entries, apexes, and exits easy to read at speed.
  const curbGeometry = new THREE.BoxGeometry(0.62, 0.1, 1.55);
  const redCurbs = new THREE.InstancedMesh(
    curbGeometry,
    new THREE.MeshStandardMaterial({ color: 0xd94b43, roughness: 0.82 }),
    sampleCount / 4,
  );
  const whiteCurbs = new THREE.InstancedMesh(
    curbGeometry,
    new THREE.MeshStandardMaterial({ color: 0xf4ead8, roughness: 0.82 }),
    sampleCount / 4,
  );
  let redIndex = 0;
  let whiteIndex = 0;
  for (let i = 0; i < sampleCount; i += 4) {
    const tangent = tangents[i];
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x);
    markerQuaternion.setFromAxisAngle(UP, Math.atan2(tangent.x, tangent.z));
    for (const side of [-1, 1]) {
      const curbPosition = points[i].clone().addScaledVector(right, side * (widths[i] / 2 - 0.18));
      curbPosition.y = 0.16;
      markerMatrix.compose(curbPosition, markerQuaternion, markerScale);
      const useRed = (i / 4 + (side > 0 ? 1 : 0)) % 2 === 0;
      if (useRed) redCurbs.setMatrixAt(redIndex++, markerMatrix);
      else whiteCurbs.setMatrixAt(whiteIndex++, markerMatrix);
    }
  }
  redCurbs.castShadow = true;
  whiteCurbs.castShadow = true;
  redCurbs.receiveShadow = true;
  whiteCurbs.receiveShadow = true;
  scene.add(redCurbs, whiteCurbs);

  // A restrained dashed guide exposes the route without dictating a racing line.
  const dashStep = 12;
  const dashCount = Math.ceil(sampleCount / dashStep);
  const dashes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 0.018, 2.15),
    new THREE.MeshBasicMaterial({ color: 0xe9dfac }),
    dashCount,
  );
  for (let i = 0, instance = 0; i < sampleCount; i += dashStep, instance++) {
    const tangent = tangents[i];
    markerQuaternion.setFromAxisAngle(UP, Math.atan2(tangent.x, tangent.z));
    const dashPosition = points[i].clone();
    dashPosition.y = 0.17;
    markerMatrix.compose(dashPosition, markerQuaternion, markerScale);
    dashes.setMatrixAt(instance, markerMatrix);
  }
  scene.add(dashes);

  const startLine = new THREE.Mesh(
    new THREE.BoxGeometry(widths[0] - 1.2, 0.025, 0.7),
    new THREE.MeshBasicMaterial({ color: 0xf4ead8 }),
  );
  startLine.position.copy(points[0]);
  startLine.position.y = 0.18;
  startLine.rotation.y = Math.atan2(tangents[0].x, tangents[0].z);
  scene.add(startLine);

  return { points, tangents, widths };
}

function parkingMarkBlocked(
  mark: RoadMarkDefinition,
  map: GameMapDefinition,
  roads: GameMapDefinition["roads"],
  corridors: NonNullable<GameMapDefinition["corridors"]>,
) {
  const insideBuilding = map.buildings.some((building) => {
    const rotation = building.rotation ?? 0;
    const dx = mark.x - building.x;
    const dz = mark.z - building.z;
    const localX = Math.cos(rotation) * dx - Math.sin(rotation) * dz;
    const localZ = Math.sin(rotation) * dx + Math.cos(rotation) * dz;
    return Math.abs(localX) <= building.width / 2 + 2.2
      && Math.abs(localZ) <= building.depth / 2 + 2.2;
  });
  if (insideBuilding) return true;
  const insideAccess = roads.some((road) => {
    if (road.role !== "access") return false;
    const rotation = road.rotation ?? 0;
    const dx = mark.x - road.x;
    const dz = mark.z - road.z;
    const localX = Math.cos(rotation) * dx - Math.sin(rotation) * dz;
    const localZ = Math.sin(rotation) * dx + Math.cos(rotation) * dz;
    return Math.abs(localX) <= road.width / 2 + 1.5
      && Math.abs(localZ) <= road.depth / 2 + 1.5;
  });
  if (insideAccess) return true;
  return corridors.some((corridor) => {
    for (let index = 1; index < corridor.points.length; index++) {
      if (distanceToSegmentSquared2D(mark, corridor.points[index - 1], corridor.points[index])
        <= (corridor.width / 2 + 1.5) ** 2) return true;
    }
    return false;
  });
}

function taxiwayMarkDefinitions(road: GameMapDefinition["roads"][number]) {
  const marks: RoadMarkDefinition[] = [];
  const rotation = road.rotation ?? 0;
  const edgeOffset = road.depth / 2 - 0.7;
  for (let localX = -road.width / 2 + 7; localX <= road.width / 2 - 7; localX += 14) {
    for (const localZ of [-edgeOffset, edgeOffset]) {
      marks.push(transformedMark(road.x, road.z, localX, localZ, 6, 0.16, rotation));
    }
  }
  return marks;
}

function transformedMark(
  originX: number,
  originZ: number,
  localX: number,
  localZ: number,
  width: number,
  depth: number,
  rotation: number,
): RoadMarkDefinition {
  return {
    x: originX + Math.cos(rotation) * localX + Math.sin(rotation) * localZ,
    z: originZ - Math.sin(rotation) * localX + Math.cos(rotation) * localZ,
    width,
    depth,
    rotation,
  };
}

function distanceToSegmentSquared2D(
  point: { x: number; z: number },
  start: { x: number; z: number },
  end: { x: number; z: number },
) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return (point.x - start.x) ** 2 + (point.z - start.z) ** 2;
  const amount = THREE.MathUtils.clamp(
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared,
    0,
    1,
  );
  return (point.x - (start.x + dx * amount)) ** 2 + (point.z - (start.z + dz * amount)) ** 2;
}

function forEachSpatialChunk<T extends { x: number; z: number }>(
  points: readonly T[],
  callback: (chunk: readonly T[]) => void,
) {
  const chunks = new Map<string, T[]>();
  for (const point of points) {
    const key = `${Math.floor(point.x / 96)}:${Math.floor(point.z / 96)}`;
    const chunk = chunks.get(key);
    if (chunk) chunk.push(point);
    else chunks.set(key, [point]);
  }
  chunks.forEach(callback);
}

