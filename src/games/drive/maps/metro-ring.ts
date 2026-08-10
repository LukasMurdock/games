import {
  civicBlock,
  constructionYard,
  containerYard,
  corridorSidePoints,
  defineDrivingMap,
  freightRow,
  openReversal,
  placeAlongCorridor,
  placeStamp,
  roadsideSettlement,
  scatterPoints,
  serviceYard,
  shoppingPlaza,
} from "./authoring";
import type { RoadCorridorDefinition } from "./types";

const METRO_CORRIDORS = [
  {
    id: "ring-southwest",
    width: 24,
    markings: true,
    points: [
      { x: -360, z: 0 }, { x: -350, z: -220 }, { x: -220, z: -350 }, { x: 0, z: -370 },
    ],
  },
  {
    id: "ring-southeast",
    width: 24,
    markings: true,
    points: [
      { x: 0, z: -370 }, { x: 220, z: -350 }, { x: 350, z: -220 }, { x: 370, z: 0 },
    ],
  },
  {
    id: "ring-northeast",
    width: 24,
    markings: true,
    points: [
      { x: 370, z: 0 }, { x: 350, z: 220 }, { x: 220, z: 350 }, { x: 0, z: 370 },
    ],
  },
  {
    id: "ring-northwest",
    width: 24,
    markings: true,
    points: [
      { x: 0, z: 370 }, { x: -220, z: 350 }, { x: -350, z: 220 }, { x: -360, z: 0 },
    ],
  },
  {
    id: "market-avenue",
    width: 20,
    markings: true,
    points: [
      { x: -360, z: 0 }, { x: -180, z: -20 }, { x: 0, z: 0 }, { x: 180, z: 20 }, { x: 370, z: 0 },
    ],
  },
  {
    id: "civic-avenue",
    width: 20,
    markings: true,
    points: [
      { x: 0, z: -370 }, { x: 20, z: -180 }, { x: 0, z: 0 }, { x: -20, z: 180 }, { x: 0, z: 370 },
    ],
  },
  {
    id: "diagonal-cut",
    width: 15,
    surfaceColor: 0x504b42,
    points: [
      { x: -285, z: -285 }, { x: -110, z: -90 }, { x: 0, z: 0 }, { x: 120, z: 100 }, { x: 285, z: 285 },
    ],
  },
  {
    id: "industrial-link",
    width: 16,
    markings: "taxiway",
    points: [
      { x: -350, z: -220 }, { x: -190, z: -170 }, { x: -60, z: -250 }, { x: 0, z: -370 },
    ],
  },
  {
    id: "north-transfer",
    width: 17,
    points: [
      { x: -350, z: 220 }, { x: -190, z: 170 }, { x: -20, z: 180 }, { x: 170, z: 205 }, { x: 350, z: 220 },
    ],
  },
  {
    id: "southeast-transfer",
    width: 17,
    markings: true,
    points: [
      { x: 20, z: -180 }, { x: 155, z: -220 }, { x: 285, z: -285 },
    ],
  },
  {
    id: "northwest-slip",
    width: 15,
    points: [
      { x: -20, z: 180 }, { x: -115, z: 275 }, { x: -220, z: 350 },
    ],
  },
] satisfies readonly RoadCorridorDefinition[];

const metroTrees = [
  ...scatterPoints({
    seed: 0x510f311,
    count: 32,
    bounds: { minX: -320, maxX: -175, minZ: 35, maxZ: 180 },
    minimumSpacing: 14,
    avoidCorridors: METRO_CORRIDORS,
    pavementClearance: 8,
  }),
  ...scatterPoints({
    seed: 0x78a20c4,
    count: 30,
    bounds: { minX: 40, maxX: 180, minZ: 220, maxZ: 335 },
    minimumSpacing: 13,
    avoidCorridors: METRO_CORRIDORS,
    pavementClearance: 8,
  }),
  ...scatterPoints({
    seed: 0xc4129e8,
    count: 30,
    bounds: { minX: 80, maxX: 260, minZ: -315, maxZ: -190 },
    minimumSpacing: 14,
    avoidCorridors: METRO_CORRIDORS,
    pavementClearance: 8,
  }),
  ...scatterPoints({
    seed: 0x398ac12,
    count: 28,
    bounds: { minX: -330, maxX: -210, minZ: -130, maxZ: 100 },
    minimumSpacing: 14,
    avoidCorridors: METRO_CORRIDORS,
    pavementClearance: 8,
  }),
];

export const METRO_RING_MAP = defineDrivingMap({
  id: "metro-ring",
  title: "Metro Ring",
  description: "A broad beltway around dense working neighborhoods.",
  worldLimit: 450,
  groundSize: 1000,
  environment: {
    background: 0xc5d8d3,
    grass: 0x6f7854,
    road: 0x3d4341,
    fogNear: 145,
    fogFar: 255,
    cameraFar: 295,
    sideCameraFar: 265,
    shadowExtent: 44,
    shadowFar: 155,
  },
  corridors: METRO_CORRIDORS,
  groundPatches: [
    { x: -190, z: -180, width: 150, depth: 120, rotation: 0.08, color: 0x81755b },
    { x: 175, z: -125, width: 170, depth: 130, rotation: -0.06, color: 0x74745e },
    { x: 225, z: 185, width: 150, depth: 135, rotation: 0.04, color: 0x82795f },
    { x: -155, z: 210, width: 180, depth: 120, rotation: -0.08, color: 0x77745a },
  ],
  districts: [
    placeStamp("central-reversal", openReversal(30), { x: 0, z: 0 }),
    placeAlongCorridor("west-civic", civicBlock({
      width: 112,
      depth: 104,
      colors: [0xc47d5f, 0x718d8a, 0xd1a563, 0x74829b],
    }), { corridor: "market-avenue", distance: 180, side: "left", setback: 10, entranceWidth: 18 }),
    placeAlongCorridor("market-plaza", shoppingPlaza({
      width: 138,
      depth: 96,
      color: 0xb4a77f,
    }), { corridor: "market-avenue", distance: 520, side: "right", setback: 10, entranceWidth: 20 }),
    placeAlongCorridor("northeast-plaza", shoppingPlaza({
      width: 116,
      depth: 82,
      color: 0x77908b,
    }), { corridor: "ring-northeast", distance: 100, side: "left", setback: 8, entranceWidth: 18 }),
    placeAlongCorridor("southwest-construction", constructionYard({
      width: 92,
      depth: 78,
    }), { corridor: "industrial-link", distance: 170, side: "left", setback: 8 }),
    placeAlongCorridor("east-containers", containerYard({
      rows: 3,
      columns: 3,
      colors: [0xb86f55, 0x668985, 0xc19a65],
    }), { corridor: "ring-southeast", distance: 300, side: "left", setback: 8, entranceWidth: 18 }),
    placeAlongCorridor("north-homes", roadsideSettlement({
      buildings: 4,
      colors: [0xc58b6d, 0xd0b987, 0x738f8c],
    }), { corridor: "ring-northwest", distance: 70, side: "left", setback: 8 }),
    placeAlongCorridor("east-service", serviceYard({
      width: 100,
      depth: 72,
      color: 0x78938d,
    }), { corridor: "ring-southeast", distance: 480, side: "left", setback: 8, entranceWidth: 16 }),
    placeAlongCorridor("west-freight", freightRow({
      sheds: 4,
      shedSize: [14, 24],
      gap: 16,
      colors: [0xb98d67, 0xa67c5d],
    }), {
      corridor: "ring-northwest",
      distance: 500,
      side: "left",
      setback: 8,
      rotation: Math.PI / 2,
    }),
  ],
  buildings: [
    { x: -35, z: 255, width: 10, depth: 10, height: 31, color: 0xd16643, style: "tower" },
  ],
  trees: metroTrees,
  streetlights: corridorSidePoints(METRO_CORRIDORS, { spacing: 62, shoulderOffset: 4.5 }),
  barriers: [
    { x: -18, z: -45 }, { x: 18, z: -45 },
    { x: -75, z: -242 }, { x: -67, z: -246 },
  ],
  chasePlacement: {
    preferredAreas: [
      { kind: "rectangle", x: 0, z: -330, width: 500, depth: 70 },
      { kind: "rectangle", x: 0, z: 330, width: 500, depth: 70 },
      { kind: "rectangle", x: -330, z: 0, width: 70, depth: 500 },
      { kind: "rectangle", x: 330, z: 0, width: 70, depth: 500 },
      { kind: "rectangle", x: 150, z: -220, width: 300, depth: 60, rotation: -0.25 },
      { kind: "rectangle", x: -120, z: 275, width: 270, depth: 56, rotation: -0.72 },
    ],
    noSpawnAreas: [
      { kind: "circle", x: 0, z: 0, radius: 55 },
      { kind: "circle", x: -35, z: 255, radius: 24 },
    ],
  },
  spawn: { source: "position", x: 0, z: -330, heading: 0 },
});
