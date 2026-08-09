export type RoadSegmentDefinition = {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation?: number;
  markings?: boolean | "taxiway";
  surfaceColor?: number;
  role?: "access" | "internal";
};

export type ParkingLotDefinition = {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation?: number;
};

export type RoadCorridorDefinition = {
  id: string;
  width: number;
  points: readonly { x: number; z: number }[];
  markings?: boolean | "taxiway";
  surfaceColor?: number;
  junctionScale?: number;
  allowDeadEndStart?: boolean;
  allowDeadEndEnd?: boolean;
};

export type BuildingDefinition = {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  color: number;
  rotation?: number;
  style?: "standard" | "hangar" | "freight" | "tower";
};

export type PropDefinition = {
  x: number;
  z: number;
};

export type SignDefinition = PropDefinition & {
  rotation?: number;
  color?: number;
  kind?: "freight" | "service" | "civic" | "retail" | "construction" | "container";
};

export type DistrictMarkingDefinition = {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation?: number;
  color?: number;
};

export type GroundPatchDefinition = {
  x: number;
  z: number;
  width: number;
  depth: number;
  color: number;
  rotation?: number;
};

export type CircuitPhrase = {
  kind: "acceleration" | "sweeper" | "tightening" | "transition" | "cooldown" | "hairpin";
  span: number;
  radius: number;
  width: number;
};

export type MapSpawn =
  | { source: "circuit"; sampleIndex?: number }
  | { source: "position"; x: number; z: number; heading: number };

export type PlacementArea =
  | { kind: "circle"; x: number; z: number; radius: number }
  | { kind: "rectangle"; x: number; z: number; width: number; depth: number; rotation?: number };

export type ChasePlacementDefinition = {
  preferredAreas?: readonly PlacementArea[];
  noSpawnAreas?: readonly PlacementArea[];
};

export type CompiledDistrictDefinition = {
  id: string;
  hostCorridor?: string;
  center: { x: number; z: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  entrances: readonly { x: number; z: number; heading: number }[];
};

export type MapLayoutDiagnostics = {
  corridorLength: number;
  shortestSegment: number;
  shortSegments: number;
  intersections: number;
  acuteIntersections: number;
  connectedComponents: number;
  deadEnds: number;
  intentionalDeadEnds: number;
  cycleRank: number;
  maximumDecisionSpacing: number;
  districts: number;
  entrances: number;
  disconnectedEntrances: number;
  warnings: readonly string[];
};

export type GameMapDefinition = {
  id: string;
  title: string;
  description: string;
  worldLimit: number;
  groundSize: number;
  environment: {
    background: number;
    grass: number;
    road: number;
    fogNear: number;
    fogFar: number;
    cameraFar: number;
    sideCameraFar: number;
    shadowExtent: number;
    shadowFar: number;
  };
  roads: readonly RoadSegmentDefinition[];
  corridors?: readonly RoadCorridorDefinition[];
  parkingLots: readonly ParkingLotDefinition[];
  groundPatches?: readonly GroundPatchDefinition[];
  buildings: readonly BuildingDefinition[];
  trees: readonly PropDefinition[];
  streetlights: readonly PropDefinition[];
  barriers: readonly PropDefinition[];
  signs?: readonly SignDefinition[];
  districtMarkings?: readonly DistrictMarkingDefinition[];
  compiledDistricts?: readonly CompiledDistrictDefinition[];
  circuit?: readonly CircuitPhrase[];
  chasePlacement?: ChasePlacementDefinition;
  layoutDiagnostics?: MapLayoutDiagnostics;
  spawn: MapSpawn;
};
