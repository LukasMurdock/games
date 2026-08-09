import type {
  BuildingDefinition,
  DistrictMarkingDefinition,
  GameMapDefinition,
  GroundPatchDefinition,
  ParkingLotDefinition,
  PropDefinition,
  RoadCorridorDefinition,
  RoadSegmentDefinition,
  SignDefinition,
} from "./types";

export type Point2 = { x: number; z: number };

export type MapStamp = {
  roads?: readonly RoadSegmentDefinition[];
  parkingLots?: readonly ParkingLotDefinition[];
  groundPatches?: readonly GroundPatchDefinition[];
  buildings?: readonly BuildingDefinition[];
  trees?: readonly PropDefinition[];
  streetlights?: readonly PropDefinition[];
  barriers?: readonly PropDefinition[];
  signs?: readonly SignDefinition[];
  districtMarkings?: readonly DistrictMarkingDefinition[];
};

type AbsoluteStampPlacement = {
  kind: "absolute";
  id: string;
  at: Point2;
  heading?: number;
  stamp: MapStamp;
};

type CorridorStampPlacement = {
  kind: "corridor";
  id: string;
  corridor: string;
  distance: number;
  side: "left" | "right";
  setback: number;
  entranceWidth: number;
  entranceOffsets: readonly number[];
  rotation: number;
  stamp: MapStamp;
};

export type StampPlacement = AbsoluteStampPlacement | CorridorStampPlacement;

type ExpandedStamp = Required<MapStamp> & {
  roads: RoadSegmentDefinition[];
  districtId: string;
  hostCorridor?: string;
  center: Point2;
};

export type DrivingMapSource = Omit<
  GameMapDefinition,
  "roads" | "corridors" | "parkingLots" | "groundPatches" | "buildings" | "trees" | "streetlights" | "barriers" | "signs" | "districtMarkings" | "compiledDistricts"
> & {
  roads?: readonly RoadSegmentDefinition[];
  corridors: readonly RoadCorridorDefinition[];
  districts?: readonly StampPlacement[];
  parkingLots?: readonly ParkingLotDefinition[];
  groundPatches?: readonly GroundPatchDefinition[];
  buildings?: readonly BuildingDefinition[];
  trees?: readonly PropDefinition[];
  streetlights?: readonly PropDefinition[];
  barriers?: readonly PropDefinition[];
  signs?: readonly SignDefinition[];
  districtMarkings?: readonly DistrictMarkingDefinition[];
};

export function defineDrivingMap(source: DrivingMapSource): GameMapDefinition {
  validateSource(source);
  const expanded = compileDistricts(source);
  const map: GameMapDefinition = {
    id: source.id,
    title: source.title,
    description: source.description,
    worldLimit: source.worldLimit,
    groundSize: source.groundSize,
    environment: source.environment,
    roads: [...(source.roads ?? []), ...expanded.flatMap((stamp) => stamp.roads)],
    corridors: source.corridors,
    parkingLots: [...(source.parkingLots ?? []), ...expanded.flatMap((stamp) => stamp.parkingLots)],
    groundPatches: [...(source.groundPatches ?? []), ...expanded.flatMap((stamp) => stamp.groundPatches)],
    buildings: [...(source.buildings ?? []), ...expanded.flatMap((stamp) => stamp.buildings)],
    trees: [...(source.trees ?? []), ...expanded.flatMap((stamp) => stamp.trees)],
    streetlights: [...(source.streetlights ?? []), ...expanded.flatMap((stamp) => stamp.streetlights)],
    barriers: [...(source.barriers ?? []), ...expanded.flatMap((stamp) => stamp.barriers)],
    signs: [...(source.signs ?? []), ...expanded.flatMap((stamp) => stamp.signs)],
    districtMarkings: [
      ...(source.districtMarkings ?? []),
      ...expanded.flatMap((stamp) => stamp.districtMarkings),
    ],
    compiledDistricts: expanded.map((stamp) => {
      const bounds = compiledStampBounds(stamp);
      return {
        id: stamp.districtId,
        hostCorridor: stamp.hostCorridor,
        center: stamp.center,
        bounds,
        entrances: stamp.roads.filter((road) => road.role === "access").map((road) => ({
          x: road.x,
          z: road.z,
          heading: Math.atan2(stamp.center.x - road.x, stamp.center.z - road.z),
        })),
      };
    }),
    circuit: source.circuit,
    chasePlacement: source.chasePlacement,
    layoutDiagnostics: analyzeLayout(source, expanded),
    spawn: source.spawn,
  };
  validateCompiledContent(map);
  return map;
}

export function placeStamp(id: string, stamp: MapStamp, at: Point2, heading = 0): StampPlacement {
  return { kind: "absolute", id, stamp, at, heading };
}

export function placeAlongCorridor(
  id: string,
  stamp: MapStamp,
  options: {
    corridor: string;
    distance: number;
    side: "left" | "right";
    setback?: number;
    entranceWidth?: number;
    entranceOffsets?: readonly number[];
    rotation?: number;
  },
): StampPlacement {
  return {
    kind: "corridor",
    id,
    stamp,
    corridor: options.corridor,
    distance: options.distance,
    side: options.side,
    setback: options.setback ?? 8,
    entranceWidth: options.entranceWidth ?? 14,
    entranceOffsets: options.entranceOffsets ?? [0],
    rotation: options.rotation ?? 0,
  };
}

function markingOutline(
  x: number,
  z: number,
  width: number,
  depth: number,
  color = 0xe5d8a8,
): DistrictMarkingDefinition[] {
  return [
    { x, z: z - depth / 2, width, depth: 0.18, color },
    { x, z: z + depth / 2, width, depth: 0.18, color },
    { x: x - width / 2, z, width: 0.18, depth, color },
    { x: x + width / 2, z, width: 0.18, depth, color },
  ];
}

export function freightRow(options: {
  sheds: number;
  shedSize: readonly [number, number];
  gap: number;
  colors: readonly number[];
}): MapStamp {
  const [width, depth] = options.shedSize;
  const totalDepth = options.sheds * depth + (options.sheds - 1) * options.gap;
  return {
    parkingLots: [{
      x: 0,
      z: 0,
      width: width + 14,
      depth: totalDepth + 2,
    }],
    buildings: Array.from({ length: options.sheds }, (_, index) => ({
      x: 0,
      z: -totalDepth / 2 + depth / 2 + index * (depth + options.gap),
      width,
      depth,
      height: 5 + index % 2 * 0.7,
      color: options.colors[index % options.colors.length],
      style: "freight" as const,
    })),
    streetlights: Array.from({ length: options.sheds }, (_, index) => ({
      x: width / 2 + 4.5,
      z: -totalDepth / 2 + depth / 2 + index * (depth + options.gap),
    })),
    signs: [{ x: width / 2 + 4, z: -totalDepth / 2 + 5, color: 0xd2a74f, kind: "freight" }],
    districtMarkings: Array.from({ length: options.sheds }, (_, index) => markingOutline(
      width / 2 + 3,
      -totalDepth / 2 + depth / 2 + index * (depth + options.gap),
      5,
      depth - 5,
    )).flat(),
  };
}

export function serviceYard(options: {
  width: number;
  depth: number;
  color: number;
}): MapStamp {
  return {
    roads: [{ x: 0, z: 0, width: 12, depth: options.depth - 8 }],
    parkingLots: [{ x: 0, z: 0, width: options.width, depth: options.depth }],
    buildings: [
      {
        x: -options.width * 0.3,
        z: 0,
        width: 20,
        depth: options.depth * 0.58,
        height: 7,
        color: options.color,
        style: "hangar",
      },
      {
        x: options.width * 0.32,
        z: options.depth * 0.22,
        width: 13,
        depth: 18,
        height: 5,
        color: 0xb98260,
        style: "freight",
      },
    ],
    streetlights: [
      { x: -options.width * 0.43, z: -options.depth * 0.4 },
      { x: options.width * 0.43, z: options.depth * 0.4 },
    ],
    barriers: [
      { x: -5, z: -options.depth / 2 + 2 },
      { x: 5, z: -options.depth / 2 + 2 },
    ],
    signs: [{
      x: options.width * 0.2,
      z: -options.depth / 2 + 5,
      color: options.color,
      kind: "service",
    }],
    districtMarkings: [
      ...markingOutline(-options.width * 0.1, 0, 11, options.depth * 0.42),
      ...markingOutline(options.width * 0.32, -options.depth * 0.18, 10, 13, 0xe6bc50),
    ],
  };
}

export function openReversal(radius: number): MapStamp {
  return {
    parkingLots: [{ x: 0, z: 0, width: radius * 2, depth: radius * 2 }],
    barriers: [
      { x: -radius + 5, z: -radius + 5 },
      { x: radius - 5, z: -radius + 5 },
      { x: -radius + 5, z: radius - 5 },
      { x: radius - 5, z: radius - 5 },
    ],
  };
}

export function civicBlock(options: { width: number; depth: number; colors: readonly number[] }): MapStamp {
  const insetX = options.width * 0.3;
  const insetZ = options.depth * 0.3;
  return {
    roads: [{ x: 0, z: 0, width: 12, depth: options.depth * 0.78 }],
    parkingLots: [{ x: 0, z: 0, width: options.width, depth: options.depth }],
    buildings: [
      { x: -insetX, z: -insetZ, width: 20, depth: 18, height: 16, color: options.colors[0] },
      { x: insetX, z: -insetZ, width: 18, depth: 18, height: 10, color: options.colors[1 % options.colors.length] },
      { x: -insetX, z: insetZ, width: 18, depth: 20, height: 12, color: options.colors[2 % options.colors.length] },
      { x: insetX, z: insetZ, width: 22, depth: 18, height: 20, color: options.colors[3 % options.colors.length] },
    ],
    streetlights: [
      { x: 0, z: -options.depth * 0.42 },
      { x: 0, z: options.depth * 0.42 },
    ],
    signs: [{
      x: -options.width * 0.16,
      z: -options.depth * 0.44,
      color: options.colors[0],
      kind: "civic",
    }],
    districtMarkings: [
      ...markingOutline(-15, 0, 12, 18),
      ...markingOutline(15, 0, 12, 18),
    ],
  };
}

export function shoppingPlaza(options: { width: number; depth: number; color: number }): MapStamp {
  return {
    roads: [{ x: 0, z: -options.depth * 0.12, width: 12, depth: options.depth * 0.5 }],
    parkingLots: [{ x: 0, z: 0, width: options.width, depth: options.depth }],
    buildings: [{
      x: 0,
      z: options.depth * 0.31,
      width: options.width * 0.74,
      depth: options.depth * 0.24,
      height: 8,
      color: options.color,
    }],
    barriers: [
      { x: -8, z: -options.depth * 0.42 },
      { x: 8, z: -options.depth * 0.42 },
    ],
    streetlights: [
      { x: -options.width * 0.34, z: -options.depth * 0.25 },
      { x: options.width * 0.34, z: -options.depth * 0.25 },
    ],
    signs: [{
      x: -options.width * 0.28,
      z: -options.depth * 0.42,
      color: options.color,
      kind: "retail",
    }],
    districtMarkings: [
      ...markingOutline(-options.width * 0.18, -options.depth * 0.08, 12, 18),
      ...markingOutline(options.width * 0.18, -options.depth * 0.08, 12, 18),
    ],
  };
}

export function constructionYard(options: { width: number; depth: number }): MapStamp {
  return {
    roads: [{ x: 0, z: 0, width: 11, depth: options.depth - 6, surfaceColor: 0x5f5849 }],
    groundPatches: [{ x: 0, z: 0, width: options.width, depth: options.depth, color: 0x8c7957 }],
    buildings: [
      { x: -options.width * 0.28, z: 0, width: 12, depth: 24, height: 5, color: 0xb9865f, style: "freight" },
      { x: options.width * 0.28, z: options.depth * 0.18, width: 10, depth: 18, height: 4, color: 0x728c86, style: "freight" },
    ],
    barriers: [
      { x: -8, z: -options.depth / 2 + 2 },
      { x: 0, z: -options.depth / 2 + 2 },
      { x: 8, z: -options.depth / 2 + 2 },
    ],
    signs: [{
      x: -options.width * 0.36,
      z: -options.depth * 0.38,
      color: 0xd78b43,
      kind: "construction",
    }],
    districtMarkings: [
      ...markingOutline(-12, -options.depth * 0.18, 11, 18, 0xe6bc50),
    ],
  };
}

export function containerYard(options: {
  rows: number;
  columns: number;
  colors: readonly number[];
}): MapStamp {
  const spacingX = 18;
  const spacingZ = 28;
  const width = options.columns * spacingX + 20;
  const depth = options.rows * spacingZ + 20;
  return {
    parkingLots: [{ x: 0, z: 0, width, depth }],
    buildings: Array.from({ length: options.rows * options.columns }, (_, index) => {
      const column = index % options.columns;
      const row = Math.floor(index / options.columns);
      return {
        x: (column - (options.columns - 1) / 2) * spacingX,
        z: (row - (options.rows - 1) / 2) * spacingZ,
        width: 8,
        depth: 18,
        height: 4.2,
        color: options.colors[index % options.colors.length],
        style: "freight" as const,
      };
    }),
    signs: [{
      x: -width * 0.34,
      z: -depth * 0.42,
      color: options.colors[0],
      kind: "container",
    }],
    districtMarkings: [
      ...markingOutline(-width * 0.2, -depth * 0.43, 11, 13, 0xe6bc50),
      ...markingOutline(width * 0.2, -depth * 0.43, 11, 13, 0xe6bc50),
    ],
  };
}

export function roadsideSettlement(options: { buildings: number; colors: readonly number[] }): MapStamp {
  return {
    buildings: Array.from({ length: options.buildings }, (_, index) => ({
      x: (index - (options.buildings - 1) / 2) * 25,
      z: 0,
      width: 16,
      depth: 18,
      height: 7 + index % 3 * 2,
      color: options.colors[index % options.colors.length],
    })),
    streetlights: Array.from({ length: Math.max(1, options.buildings - 1) }, (_, index) => ({
      x: (index - (options.buildings - 2) / 2) * 25 + 12.5,
      z: -13,
    })),
  };
}

export function corridorSidePoints(
  corridors: readonly RoadCorridorDefinition[],
  options: { spacing: number; shoulderOffset: number },
): PropDefinition[] {
  const points: PropDefinition[] = [];
  let side = -1;
  for (const corridor of corridors) {
    for (let index = 1; index < corridor.points.length; index++) {
      const start = corridor.points[index - 1];
      const end = corridor.points[index];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      const rightX = dz / length;
      const rightZ = -dx / length;
      const offset = corridor.width / 2 + options.shoulderOffset;
      for (let distance = options.spacing / 2; distance < length - options.spacing / 3; distance += options.spacing) {
        points.push({
          x: start.x + dx * distance / length + rightX * offset * side,
          z: start.z + dz * distance / length + rightZ * offset * side,
        });
        side *= -1;
      }
    }
  }
  return points;
}

export function scatterPoints(options: {
  seed: number;
  count: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  minimumSpacing: number;
  avoidCorridors?: readonly RoadCorridorDefinition[];
  pavementClearance?: number;
}): PropDefinition[] {
  let state = options.seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const points: PropDefinition[] = [];
  const attempts = options.count * 30;
  for (let attempt = 0; attempt < attempts && points.length < options.count; attempt++) {
    const point = {
      x: lerp(options.bounds.minX, options.bounds.maxX, random()),
      z: lerp(options.bounds.minZ, options.bounds.maxZ, random()),
    };
    if (points.some((other) => distanceSquared(point, other) < options.minimumSpacing ** 2)) continue;
    if ((options.avoidCorridors ?? []).some((corridor) => {
      const clearance = corridor.width / 2 + (options.pavementClearance ?? 0);
      for (let index = 1; index < corridor.points.length; index++) {
        if (distanceToSegmentSquared(point, corridor.points[index - 1], corridor.points[index]) <= clearance ** 2) {
          return true;
        }
      }
      return false;
    })) continue;
    points.push(point);
  }
  return points;
}

function compileDistricts(source: DrivingMapSource): ExpandedStamp[] {
  const expanded: ExpandedStamp[] = [];
  const reserved: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [
    ...(source.buildings ?? []).map((building) => rectangleBounds(building)),
    ...(source.parkingLots ?? []).map((parkingLot) => rectangleBounds(parkingLot)),
  ];
  for (const placement of source.districts ?? []) {
    if (placement.kind === "absolute") {
      const stamp = expandStampAt(
        placement.id,
        placement.stamp,
        placement.at,
        placement.heading ?? 0,
        [],
      );
      expanded.push(stamp);
      reserved.push(compiledStampBounds(stamp));
      continue;
    }
    const corridor = source.corridors.find((candidate) => candidate.id === placement.corridor);
    if (!corridor) throw new Error(`Map "${source.id}" district "${placement.id}" uses an unknown corridor.`);
    const localBounds = stampBounds(placement.stamp);
    const halfWidth = Math.max(Math.abs(localBounds.minX), Math.abs(localBounds.maxX));
    const halfDepth = Math.max(Math.abs(localBounds.minZ), Math.abs(localBounds.maxZ));
    const side = placement.side === "left" ? 1 : -1;
    let accepted: ExpandedStamp | null = null;
    const failures = { boundary: 0, overlap: 0, corridor: 0 };
    for (const distanceOffset of [0, 35, -35, 70, -70, 105, -105]) {
      const sample = sampleCorridor(corridor, placement.distance + distanceOffset);
      if (!sample) continue;
      const roadHeading = Math.atan2(sample.tangent.x, sample.tangent.z) - Math.PI / 2;
      const heading = roadHeading + placement.rotation + (side < 0 ? Math.PI : 0);
      const roadNormal = { x: -sample.tangent.z, z: sample.tangent.x };
      const stampLocalX = { x: Math.cos(heading), z: -Math.sin(heading) };
      const stampLocalZ = { x: Math.sin(heading), z: Math.cos(heading) };
      const outwardHalf = Math.abs(roadNormal.x * stampLocalX.x + roadNormal.z * stampLocalX.z) * halfWidth
        + Math.abs(roadNormal.x * stampLocalZ.x + roadNormal.z * stampLocalZ.z) * halfDepth;
      const centerDistance = corridor.width / 2 + placement.setback + outwardHalf;
      const at = {
        x: sample.point.x + roadNormal.x * centerDistance * side,
        z: sample.point.z + roadNormal.z * centerDistance * side,
      };
      const entranceDepth = corridor.width / 2 + placement.setback + 2;
      const entranceCenter = {
        x: sample.point.x + roadNormal.x * entranceDepth * 0.5 * side,
        z: sample.point.z + roadNormal.z * entranceDepth * 0.5 * side,
      };
      const roads: RoadSegmentDefinition[] = placement.entranceOffsets.map((offset) => ({
        x: entranceCenter.x + sample.tangent.x * offset,
        z: entranceCenter.z + sample.tangent.z * offset,
        width: placement.entranceWidth,
        depth: entranceDepth,
        rotation: roadHeading,
        markings: false,
        role: "access",
      }));
      const candidate = expandStampAt(
        placement.id,
        placement.stamp,
        at,
        heading,
        roads,
        corridor.id,
      );
      const bounds = compiledStampBounds(candidate);
      const insideBoundary = bounds.minX > -source.worldLimit
        && bounds.maxX < source.worldLimit
        && bounds.minZ > -source.worldLimit
        && bounds.maxZ < source.worldLimit;
      const overlaps = reserved.some((other) => boundsOverlap(bounds, other, 6));
      const crossesAnotherCorridor = source.corridors.some((otherCorridor) => (
        otherCorridor.id !== corridor.id
        && corridorIntersectsStamp(otherCorridor, at, heading, localBounds)
      ));
      if (!insideBoundary || overlaps || crossesAnotherCorridor) {
        if (!insideBoundary) failures.boundary++;
        if (overlaps) failures.overlap++;
        if (crossesAnotherCorridor) failures.corridor++;
        continue;
      }
      accepted = candidate;
      reserved.push(bounds);
      break;
    }
    if (!accepted) {
      throw new Error(
        `Map "${source.id}" could not place district "${placement.id}" `
          + `(boundary ${failures.boundary}, district overlap ${failures.overlap}, road overlap ${failures.corridor}).`,
      );
    }
    expanded.push(accepted);
  }
  return expanded;
}

function expandStampAt(
  districtId: string,
  stamp: MapStamp,
  at: Point2,
  heading: number,
  entranceRoads: RoadSegmentDefinition[],
  hostCorridor?: string,
): ExpandedStamp {
  const transformPoint = (point: Point2) => ({
    x: at.x + Math.cos(heading) * point.x + Math.sin(heading) * point.z,
    z: at.z - Math.sin(heading) * point.x + Math.cos(heading) * point.z,
  });
  const roads = [
    ...entranceRoads,
    ...(stamp.roads ?? []).map((road) => ({
      ...road,
      ...transformPoint(road),
      rotation: (road.rotation ?? 0) + heading,
      role: "internal" as const,
    })),
  ];
  const barriers = (stamp.barriers ?? [])
    .map((point) => transformPoint(point))
    .filter((point) => !roads.some((road) => pointInsideRoad(point, road, 2.5)));
  return {
    districtId,
    hostCorridor,
    center: { ...at },
    roads,
    parkingLots: (stamp.parkingLots ?? []).map((lot) => ({
      ...lot,
      ...transformPoint(lot),
      rotation: (lot.rotation ?? 0) + heading,
    })),
    groundPatches: (stamp.groundPatches ?? []).map((patch) => ({
      ...patch,
      ...transformPoint(patch),
      rotation: (patch.rotation ?? 0) + heading,
    })),
    buildings: (stamp.buildings ?? []).map((building) => ({
      ...building,
      ...transformPoint(building),
      rotation: (building.rotation ?? 0) + heading,
    })),
    trees: (stamp.trees ?? []).map((point) => transformPoint(point)),
    streetlights: (stamp.streetlights ?? []).map((point) => transformPoint(point)),
    barriers,
    signs: (stamp.signs ?? []).map((sign) => ({
      ...sign,
      ...transformPoint(sign),
      rotation: (sign.rotation ?? 0) + heading,
    })),
    districtMarkings: (stamp.districtMarkings ?? []).map((marking) => ({
      ...marking,
      ...transformPoint(marking),
      rotation: (marking.rotation ?? 0) + heading,
    })),
  };
}

function pointInsideRoad(point: Point2, road: RoadSegmentDefinition, padding: number) {
  const heading = road.rotation ?? 0;
  const dx = point.x - road.x;
  const dz = point.z - road.z;
  const localX = Math.cos(heading) * dx - Math.sin(heading) * dz;
  const localZ = Math.sin(heading) * dx + Math.cos(heading) * dz;
  return Math.abs(localX) <= road.width / 2 + padding
    && Math.abs(localZ) <= road.depth / 2 + padding;
}

function stampBounds(stamp: MapStamp) {
  const bounds = emptyBounds();
  const includeRectangle = (item: {
    x: number;
    z: number;
    width: number;
    depth: number;
    rotation?: number;
  }) => {
    const rotation = item.rotation ?? 0;
    const extentX = Math.abs(Math.cos(rotation)) * item.width / 2
      + Math.abs(Math.sin(rotation)) * item.depth / 2;
    const extentZ = Math.abs(Math.sin(rotation)) * item.width / 2
      + Math.abs(Math.cos(rotation)) * item.depth / 2;
    includePoint(bounds, item.x - extentX, item.z - extentZ);
    includePoint(bounds, item.x + extentX, item.z + extentZ);
  };
  (stamp.roads ?? []).forEach(includeRectangle);
  (stamp.parkingLots ?? []).forEach(includeRectangle);
  (stamp.groundPatches ?? []).forEach(includeRectangle);
  (stamp.buildings ?? []).forEach(includeRectangle);
  for (const point of [
    ...(stamp.trees ?? []),
    ...(stamp.streetlights ?? []),
    ...(stamp.barriers ?? []),
    ...(stamp.signs ?? []),
  ]) {
    includePoint(bounds, point.x - 2, point.z - 2);
    includePoint(bounds, point.x + 2, point.z + 2);
  }
  if (!Number.isFinite(bounds.minX)) return { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  return bounds;
}

function rectangleBounds(item: {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation?: number;
}) {
  const rotation = item.rotation ?? 0;
  const extentX = Math.abs(Math.cos(rotation)) * item.width / 2
    + Math.abs(Math.sin(rotation)) * item.depth / 2;
  const extentZ = Math.abs(Math.sin(rotation)) * item.width / 2
    + Math.abs(Math.cos(rotation)) * item.depth / 2;
  return {
    minX: item.x - extentX,
    maxX: item.x + extentX,
    minZ: item.z - extentZ,
    maxZ: item.z + extentZ,
  };
}

function compiledStampBounds(stamp: ExpandedStamp) {
  const bounds = emptyBounds();
  const includeRectangle = (item: {
    x: number;
    z: number;
    width: number;
    depth: number;
    rotation?: number;
  }) => {
    const rotation = item.rotation ?? 0;
    const extentX = Math.abs(Math.cos(rotation)) * item.width / 2
      + Math.abs(Math.sin(rotation)) * item.depth / 2;
    const extentZ = Math.abs(Math.sin(rotation)) * item.width / 2
      + Math.abs(Math.cos(rotation)) * item.depth / 2;
    includePoint(bounds, item.x - extentX, item.z - extentZ);
    includePoint(bounds, item.x + extentX, item.z + extentZ);
  };
  stamp.parkingLots.forEach(includeRectangle);
  stamp.groundPatches.forEach(includeRectangle);
  stamp.buildings.forEach(includeRectangle);
  for (const point of [...stamp.trees, ...stamp.streetlights, ...stamp.barriers, ...stamp.signs]) {
    includePoint(bounds, point.x - 2, point.z - 2);
    includePoint(bounds, point.x + 2, point.z + 2);
  }
  return bounds;
}

function corridorIntersectsStamp(
  corridor: RoadCorridorDefinition,
  at: Point2,
  heading: number,
  bounds: ReturnType<typeof stampBounds>,
) {
  const padding = corridor.width / 2 + 3;
  const toLocal = (point: Point2) => {
    const dx = point.x - at.x;
    const dz = point.z - at.z;
    return {
      x: Math.cos(heading) * dx - Math.sin(heading) * dz,
      z: Math.sin(heading) * dx + Math.cos(heading) * dz,
    };
  };
  const expanded = {
    minX: bounds.minX - padding,
    maxX: bounds.maxX + padding,
    minZ: bounds.minZ - padding,
    maxZ: bounds.maxZ + padding,
  };
  for (let index = 1; index < corridor.points.length; index++) {
    if (segmentIntersectsBounds(
      toLocal(corridor.points[index - 1]),
      toLocal(corridor.points[index]),
      expanded,
    )) return true;
  }
  return false;
}

function segmentIntersectsBounds(
  start: Point2,
  end: Point2,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
) {
  let minimum = 0;
  let maximum = 1;
  for (const axis of ["x", "z"] as const) {
    const delta = end[axis] - start[axis];
    const low = axis === "x" ? bounds.minX : bounds.minZ;
    const high = axis === "x" ? bounds.maxX : bounds.maxZ;
    if (Math.abs(delta) < 0.0001) {
      if (start[axis] < low || start[axis] > high) return false;
      continue;
    }
    const first = (low - start[axis]) / delta;
    const second = (high - start[axis]) / delta;
    minimum = Math.max(minimum, Math.min(first, second));
    maximum = Math.min(maximum, Math.max(first, second));
    if (minimum > maximum) return false;
  }
  return true;
}

function sampleCorridor(corridor: RoadCorridorDefinition, requestedDistance: number) {
  if (requestedDistance < 0) return null;
  let traversed = 0;
  for (let index = 1; index < corridor.points.length; index++) {
    const start = corridor.points[index - 1];
    const end = corridor.points[index];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (requestedDistance > traversed + length) {
      traversed += length;
      continue;
    }
    const amount = (requestedDistance - traversed) / length;
    return {
      point: { x: start.x + dx * amount, z: start.z + dz * amount },
      tangent: { x: dx / length, z: dz / length },
    };
  }
  return null;
}

function emptyBounds() {
  return {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
}

function includePoint(bounds: ReturnType<typeof emptyBounds>, x: number, z: number) {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.minZ = Math.min(bounds.minZ, z);
  bounds.maxZ = Math.max(bounds.maxZ, z);
}

function boundsOverlap(
  first: ReturnType<typeof emptyBounds>,
  second: ReturnType<typeof emptyBounds>,
  margin: number,
) {
  return first.minX < second.maxX + margin
    && first.maxX > second.minX - margin
    && first.minZ < second.maxZ + margin
    && first.maxZ > second.minZ - margin;
}

function analyzeLayout(source: DrivingMapSource, districts: readonly ExpandedStamp[]) {
  let corridorLength = 0;
  let shortestSegment = Number.POSITIVE_INFINITY;
  let shortSegments = 0;
  let acuteIntersections = 0;
  const adjacency = source.corridors.map(() => new Set<number>());
  const decisions = source.corridors.map((corridor) => [0, corridorLengthOf(corridor)]);
  const intersections = new Set<string>();
  for (let corridorIndex = 0; corridorIndex < source.corridors.length; corridorIndex++) {
    const corridor = source.corridors[corridorIndex];
    for (let segmentIndex = 1; segmentIndex < corridor.points.length; segmentIndex++) {
      const length = Math.hypot(
        corridor.points[segmentIndex].x - corridor.points[segmentIndex - 1].x,
        corridor.points[segmentIndex].z - corridor.points[segmentIndex - 1].z,
      );
      corridorLength += length;
      shortestSegment = Math.min(shortestSegment, length);
      if (length < 45) shortSegments++;
    }
    for (let otherIndex = corridorIndex + 1; otherIndex < source.corridors.length; otherIndex++) {
      const details = corridorIntersectionDetails(corridor, source.corridors[otherIndex]);
      if (details.length === 0) continue;
      adjacency[corridorIndex].add(otherIndex);
      adjacency[otherIndex].add(corridorIndex);
      for (const detail of details) {
        intersections.add(`${detail.point.x.toFixed(2)}:${detail.point.z.toFixed(2)}`);
        if (!detail.joinsEndpoints && detail.angle > 1 && detail.angle < 30) acuteIntersections++;
        decisions[corridorIndex].push(distanceAlongCorridor(corridor, detail.point));
        decisions[otherIndex].push(distanceAlongCorridor(source.corridors[otherIndex], detail.point));
      }
    }
  }
  let connectedComponents = 0;
  const visited = new Set<number>();
  for (let index = 0; index < adjacency.length; index++) {
    if (visited.has(index)) continue;
    connectedComponents++;
    const pending = [index];
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined || visited.has(current)) continue;
      visited.add(current);
      adjacency[current].forEach((neighbor) => pending.push(neighbor));
    }
  }
  let deadEnds = 0;
  let intentionalDeadEnds = 0;
  for (let corridorIndex = 0; corridorIndex < source.corridors.length; corridorIndex++) {
    const corridor = source.corridors[corridorIndex];
    const endpoints = [
      { point: corridor.points[0], allowed: corridor.allowDeadEndStart },
      { point: corridor.points[corridor.points.length - 1], allowed: corridor.allowDeadEndEnd },
    ];
    for (const endpoint of endpoints) {
      const connected = source.corridors.some((other, otherIndex) => (
        otherIndex !== corridorIndex && pointTouchesCorridor(endpoint.point, other)
      ));
      if (connected) continue;
      if (endpoint.allowed) intentionalDeadEnds++;
      else deadEnds++;
    }
  }
  let maximumDecisionSpacing = 0;
  for (const corridorDecisions of decisions) {
    const ordered = [...new Set(corridorDecisions.map((distance) => Number(distance.toFixed(3))))]
      .sort((first, second) => first - second);
    for (let index = 1; index < ordered.length; index++) {
      maximumDecisionSpacing = Math.max(maximumDecisionSpacing, ordered[index] - ordered[index - 1]);
    }
  }
  const entrances = districts.flatMap((district) => district.roads.filter((road) => road.role === "access"));
  const disconnectedEntrances = entrances.filter((road) => (
    !source.corridors.some((corridor) => roadTouchesCorridor(road, corridor))
  )).length;
  const graphEdges = adjacency.reduce((sum, neighbors) => sum + neighbors.size, 0) / 2;
  const warnings: string[] = [];
  if (connectedComponents > 1) warnings.push(`${connectedComponents} disconnected road components`);
  if (deadEnds > 0) warnings.push(`${deadEnds} unintended dead ends`);
  if (acuteIntersections > 0) warnings.push(`${acuteIntersections} intersections below 30°`);
  if (shortSegments > 0) warnings.push(`${shortSegments} source segments below 45u`);
  if (maximumDecisionSpacing > 400) warnings.push(`${maximumDecisionSpacing.toFixed(0)}u maximum decision gap`);
  if (disconnectedEntrances > 0) warnings.push(`${disconnectedEntrances} disconnected district entrances`);
  return {
    corridorLength,
    shortestSegment: Number.isFinite(shortestSegment) ? shortestSegment : 0,
    shortSegments,
    intersections: intersections.size,
    acuteIntersections,
    connectedComponents,
    deadEnds,
    intentionalDeadEnds,
    cycleRank: Math.max(0, graphEdges - source.corridors.length + connectedComponents),
    maximumDecisionSpacing,
    districts: source.districts?.length ?? 0,
    entrances: entrances.length,
    disconnectedEntrances,
    warnings,
  };
}

function corridorIntersectionDetails(first: RoadCorridorDefinition, second: RoadCorridorDefinition) {
  const intersections: Array<{ point: Point2; angle: number; joinsEndpoints: boolean }> = [];
  for (let firstIndex = 1; firstIndex < first.points.length; firstIndex++) {
    for (let secondIndex = 1; secondIndex < second.points.length; secondIndex++) {
      const firstStart = first.points[firstIndex - 1];
      const firstEnd = first.points[firstIndex];
      const secondStart = second.points[secondIndex - 1];
      const secondEnd = second.points[secondIndex];
      const point = lineSegmentIntersection(firstStart, firstEnd, secondStart, secondEnd);
      if (!point) continue;
      const firstLength = Math.hypot(firstEnd.x - firstStart.x, firstEnd.z - firstStart.z);
      const secondLength = Math.hypot(secondEnd.x - secondStart.x, secondEnd.z - secondStart.z);
      const dot = ((firstEnd.x - firstStart.x) * (secondEnd.x - secondStart.x)
        + (firstEnd.z - firstStart.z) * (secondEnd.z - secondStart.z)) / (firstLength * secondLength);
      const angle = Math.acos(Math.min(1, Math.abs(dot))) * 180 / Math.PI;
      const firstEndpoint = distanceSquared(point, first.points[0]) < 0.04
        || distanceSquared(point, first.points[first.points.length - 1]) < 0.04;
      const secondEndpoint = distanceSquared(point, second.points[0]) < 0.04
        || distanceSquared(point, second.points[second.points.length - 1]) < 0.04;
      intersections.push({ point, angle, joinsEndpoints: firstEndpoint && secondEndpoint });
    }
  }
  return intersections;
}

function corridorLengthOf(corridor: RoadCorridorDefinition) {
  let length = 0;
  for (let index = 1; index < corridor.points.length; index++) {
    length += Math.hypot(
      corridor.points[index].x - corridor.points[index - 1].x,
      corridor.points[index].z - corridor.points[index - 1].z,
    );
  }
  return length;
}

function distanceAlongCorridor(corridor: RoadCorridorDefinition, point: Point2) {
  let traversed = 0;
  let closestDistance = 0;
  let closestSquared = Number.POSITIVE_INFINITY;
  for (let index = 1; index < corridor.points.length; index++) {
    const start = corridor.points[index - 1];
    const end = corridor.points[index];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    const amount = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
    const candidate = { x: start.x + dx * amount, z: start.z + dz * amount };
    const candidateSquared = distanceSquared(point, candidate);
    const length = Math.sqrt(lengthSquared);
    if (candidateSquared < closestSquared) {
      closestSquared = candidateSquared;
      closestDistance = traversed + length * amount;
    }
    traversed += length;
  }
  return closestDistance;
}

function roadTouchesCorridor(road: RoadSegmentDefinition, corridor: RoadCorridorDefinition) {
  const heading = road.rotation ?? 0;
  const toLocal = (point: Point2) => {
    const dx = point.x - road.x;
    const dz = point.z - road.z;
    return {
      x: Math.cos(heading) * dx - Math.sin(heading) * dz,
      z: Math.sin(heading) * dx + Math.cos(heading) * dz,
    };
  };
  const padding = corridor.width / 2 + 0.5;
  const bounds = {
    minX: -road.width / 2 - padding,
    maxX: road.width / 2 + padding,
    minZ: -road.depth / 2 - padding,
    maxZ: road.depth / 2 + padding,
  };
  for (let index = 1; index < corridor.points.length; index++) {
    if (segmentIntersectsBounds(toLocal(corridor.points[index - 1]), toLocal(corridor.points[index]), bounds)) {
      return true;
    }
  }
  return false;
}

function lineSegmentIntersection(a: Point2, b: Point2, c: Point2, d: Point2) {
  const abX = b.x - a.x;
  const abZ = b.z - a.z;
  const cdX = d.x - c.x;
  const cdZ = d.z - c.z;
  const denominator = abX * cdZ - abZ * cdX;
  if (Math.abs(denominator) < 0.0001) {
    for (const first of [a, b]) {
      for (const second of [c, d]) {
        if (distanceSquared(first, second) < 0.01) return { ...first };
      }
    }
    return null;
  }
  const acX = c.x - a.x;
  const acZ = c.z - a.z;
  const firstAmount = (acX * cdZ - acZ * cdX) / denominator;
  const secondAmount = (acX * abZ - acZ * abX) / denominator;
  if (firstAmount < -0.0001 || firstAmount > 1.0001 || secondAmount < -0.0001 || secondAmount > 1.0001) {
    return null;
  }
  return { x: a.x + abX * firstAmount, z: a.z + abZ * firstAmount };
}

function pointTouchesCorridor(point: Point2, corridor: RoadCorridorDefinition) {
  for (let index = 1; index < corridor.points.length; index++) {
    if (distanceToSegmentSquared(point, corridor.points[index - 1], corridor.points[index]) < 0.04) return true;
  }
  return false;
}

function validateSource(source: DrivingMapSource) {
  if (!Number.isFinite(source.worldLimit) || source.worldLimit <= 0) {
    throw new Error(`Map "${source.id}" needs a positive world limit.`);
  }
  if (source.groundSize < source.worldLimit * 2) {
    throw new Error(`Map "${source.id}" ground does not cover its boundary.`);
  }
  if (source.spawn.source === "position") {
    if (Math.abs(source.spawn.x) >= source.worldLimit || Math.abs(source.spawn.z) >= source.worldLimit) {
      throw new Error(`Map "${source.id}" spawn is outside its boundary.`);
    }
  }
  const districtIds = new Set<string>();
  for (const district of source.districts ?? []) {
    if (districtIds.has(district.id)) throw new Error(`Map "${source.id}" repeats district "${district.id}".`);
    districtIds.add(district.id);
    if (district.kind === "corridor" && (
      district.entranceWidth <= 0
      || district.entranceOffsets.length === 0
      || district.entranceOffsets.some((offset) => !Number.isFinite(offset))
    )) {
      throw new Error(`Map "${source.id}" district "${district.id}" has invalid entrances.`);
    }
  }
  const corridorIds = new Set<string>();
  for (const corridor of source.corridors) {
    if (corridorIds.has(corridor.id)) throw new Error(`Map "${source.id}" repeats corridor "${corridor.id}".`);
    corridorIds.add(corridor.id);
    if (corridor.points.length < 2 || corridor.width <= 0 || (corridor.junctionScale ?? 1) <= 0) {
      throw new Error(`Map "${source.id}" corridor "${corridor.id}" is invalid.`);
    }
    for (const point of corridor.points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
        throw new Error(`Map "${source.id}" corridor "${corridor.id}" has non-finite coordinates.`);
      }
      if (Math.abs(point.x) + corridor.width / 2 >= source.worldLimit
        || Math.abs(point.z) + corridor.width / 2 >= source.worldLimit) {
        throw new Error(`Map "${source.id}" corridor "${corridor.id}" crosses the boundary.`);
      }
    }
    for (let index = 1; index < corridor.points.length; index++) {
      if (Math.sqrt(distanceSquared(corridor.points[index - 1], corridor.points[index])) < 10) {
        throw new Error(`Map "${source.id}" corridor "${corridor.id}" has a segment shorter than 10 units.`);
      }
    }
  }
}

function validateCompiledContent(map: GameMapDefinition) {
  const assertPoint = (kind: string, point: Point2, clearance = 0) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      throw new Error(`Map "${map.id}" has non-finite ${kind} coordinates.`);
    }
    if (Math.abs(point.x) + clearance >= map.worldLimit || Math.abs(point.z) + clearance >= map.worldLimit) {
      throw new Error(`Map "${map.id}" ${kind} crosses the boundary.`);
    }
  };
  map.roads.forEach((road) => {
    const bounds = rectangleBounds(road);
    if (bounds.minX <= -map.worldLimit || bounds.maxX >= map.worldLimit
      || bounds.minZ <= -map.worldLimit || bounds.maxZ >= map.worldLimit) {
      throw new Error(`Map "${map.id}" road crosses the boundary.`);
    }
  });
  map.parkingLots.forEach((lot) => assertPoint("parking lot", lot, Math.hypot(lot.width, lot.depth) / 2));
  map.groundPatches?.forEach((patch) => assertPoint(
    "ground patch",
    patch,
    Math.hypot(patch.width, patch.depth) / 2,
  ));
  map.buildings.forEach((building) => assertPoint(
    "building",
    building,
    Math.hypot(building.width, building.depth) / 2,
  ));
  map.trees.forEach((point) => assertPoint("tree", point, 2.4));
  map.streetlights.forEach((point) => assertPoint("streetlight", point, 1.3));
  map.barriers.forEach((point) => assertPoint("barrier", point, 1.5));
  map.signs?.forEach((point) => assertPoint("sign", point, 1.5));
  map.districtMarkings?.forEach((marking) => {
    const bounds = rectangleBounds(marking);
    if (bounds.minX <= -map.worldLimit || bounds.maxX >= map.worldLimit
      || bounds.minZ <= -map.worldLimit || bounds.maxZ >= map.worldLimit) {
      throw new Error(`Map "${map.id}" district marking crosses the boundary.`);
    }
  });
  for (const area of [
    ...(map.chasePlacement?.preferredAreas ?? []),
    ...(map.chasePlacement?.noSpawnAreas ?? []),
  ]) {
    if (area.kind === "circle") {
      assertPoint("Chase placement area", area, area.radius);
      continue;
    }
    const rotation = area.rotation ?? 0;
    const extentX = Math.abs(Math.cos(rotation)) * area.width / 2
      + Math.abs(Math.sin(rotation)) * area.depth / 2;
    const extentZ = Math.abs(Math.sin(rotation)) * area.width / 2
      + Math.abs(Math.cos(rotation)) * area.depth / 2;
    if (Math.abs(area.x) + extentX >= map.worldLimit || Math.abs(area.z) + extentZ >= map.worldLimit) {
      throw new Error(`Map "${map.id}" Chase placement area crosses the boundary.`);
    }
  }
}

function distanceSquared(a: Point2, b: Point2) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function distanceToSegmentSquared(point: Point2, start: Point2, end: Point2) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return distanceSquared(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  return distanceSquared(point, { x: start.x + dx * t, z: start.z + dz * t });
}

function lerp(a: number, b: number, amount: number) {
  return a + (b - a) * amount;
}
