import {
  civicBlock,
  constructionYard,
  containerYard,
  corridorSidePoints,
  defineDrivingMap,
  openReversal,
  placeAlongCorridor,
  placeStamp,
  roadsideSettlement,
  scatterPoints,
  serviceYard,
  shoppingPlaza,
} from "./authoring";
import type { RoadCorridorDefinition } from "./types";

const NORTHPOINT_CORRIDORS = [
  {
    id: "ring-southwest",
    width: 22,
    markings: true,
    points: [
      { x: -320, z: 0 }, { x: -300, z: -180 }, { x: -180, z: -300 }, { x: 0, z: -320 },
    ],
  },
  {
    id: "ring-southeast",
    width: 22,
    markings: true,
    points: [
      { x: 0, z: -320 }, { x: 180, z: -300 }, { x: 300, z: -180 }, { x: 320, z: 0 },
    ],
  },
  {
    id: "ring-northeast",
    width: 22,
    markings: true,
    points: [
      { x: 320, z: 0 }, { x: 300, z: 180 }, { x: 180, z: 300 }, { x: 0, z: 320 },
    ],
  },
  {
    id: "ring-northwest",
    width: 22,
    markings: true,
    points: [
      { x: 0, z: 320 }, { x: -180, z: 300 }, { x: -300, z: 180 }, { x: -320, z: 0 },
    ],
  },
  {
    id: "main-street",
    width: 20,
    markings: true,
    points: [
      { x: -320, z: 0 }, { x: -160, z: -10 }, { x: 0, z: 0 }, { x: 160, z: 10 }, { x: 320, z: 0 },
    ],
  },
  {
    id: "civic-spine",
    width: 19,
    markings: true,
    points: [
      { x: 0, z: -320 }, { x: 10, z: -160 }, { x: 0, z: 0 }, { x: -10, z: 160 }, { x: 0, z: 320 },
    ],
  },
  {
    id: "south-transfer",
    width: 17,
    points: [
      { x: -300, z: -180 }, { x: -145, z: -170 }, { x: 10, z: -180 }, { x: 155, z: -190 }, { x: 300, z: -180 },
    ],
  },
  {
    id: "north-transfer",
    width: 17,
    points: [
      { x: -300, z: 180 }, { x: -150, z: 190 }, { x: -10, z: 180 }, { x: 145, z: 170 }, { x: 300, z: 180 },
    ],
  },
  {
    id: "diagonal-cut",
    width: 14,
    surfaceColor: 0x504a40,
    points: [
      { x: -240, z: -240 }, { x: -105, z: -95 }, { x: 0, z: 0 }, { x: 115, z: 105 }, { x: 240, z: 240 },
    ],
  },
] satisfies readonly RoadCorridorDefinition[];

const northpointTrees = [
  ...scatterPoints({
    seed: 0x4711ab2,
    count: 34,
    bounds: { minX: -355, maxX: -210, minZ: 45, maxZ: 300 },
    minimumSpacing: 14,
    avoidCorridors: NORTHPOINT_CORRIDORS,
    pavementClearance: 9,
  }),
  ...scatterPoints({
    seed: 0xb23a17c,
    count: 32,
    bounds: { minX: 205, maxX: 355, minZ: -290, maxZ: -35 },
    minimumSpacing: 14,
    avoidCorridors: NORTHPOINT_CORRIDORS,
    pavementClearance: 9,
  }),
  ...scatterPoints({
    seed: 0x712bc09,
    count: 26,
    bounds: { minX: -120, maxX: 115, minZ: 220, maxZ: 355 },
    minimumSpacing: 13,
    avoidCorridors: NORTHPOINT_CORRIDORS,
    pavementClearance: 8,
  }),
];

export const NORTHPOINT_MAP = defineDrivingMap({
  id: "northpoint",
  title: "Northpoint",
  description: "Strip malls, civic blocks, and broad suburban connectors.",
  worldLimit: 380,
  groundSize: 840,
  environment: {
    background: 0xc8d9d5,
    grass: 0x78805c,
    road: 0x414643,
    fogNear: 140,
    fogFar: 245,
    cameraFar: 280,
    sideCameraFar: 250,
    shadowExtent: 43,
    shadowFar: 145,
  },
  corridors: NORTHPOINT_CORRIDORS,
  groundPatches: [
    { x: -185, z: -120, width: 145, depth: 105, rotation: 0.05, color: 0x83795e },
    { x: 170, z: -120, width: 150, depth: 110, rotation: -0.06, color: 0x74755d },
    { x: -175, z: 115, width: 150, depth: 115, rotation: -0.04, color: 0x747a60 },
    { x: 175, z: 120, width: 145, depth: 110, rotation: 0.06, color: 0x877a5d },
  ],
  districts: [
    placeStamp("central-turnaround", openReversal(27), { x: 0, z: 0 }),
    placeAlongCorridor("west-civic", civicBlock({
      width: 100,
      depth: 88,
      colors: [0xc67f64, 0x718e8b, 0xd0aa70, 0x79839a],
    }), { corridor: "main-street", distance: 125, side: "left", setback: 10, entranceWidth: 18 }),
    placeAlongCorridor("south-market", shoppingPlaza({
      width: 124,
      depth: 82,
      color: 0xc0aa78,
    }), { corridor: "south-transfer", distance: 120, side: "right", setback: 9, entranceWidth: 19 }),
    placeAlongCorridor("north-market", shoppingPlaza({
      width: 116,
      depth: 78,
      color: 0x78938d,
    }), { corridor: "north-transfer", distance: 500, side: "left", setback: 9, entranceWidth: 18 }),
    placeAlongCorridor("east-service", serviceYard({
      width: 94,
      depth: 68,
      color: 0x72908b,
    }), { corridor: "main-street", distance: 525, side: "right", setback: 9, entranceOffsets: [-22, 22] }),
    placeAlongCorridor("southwest-works", constructionYard({
      width: 82,
      depth: 68,
    }), { corridor: "south-transfer", distance: 420, side: "right", setback: 8 }),
    placeAlongCorridor("east-containers", containerYard({
      rows: 2,
      columns: 3,
      colors: [0xb56f57, 0x658783, 0xc09b68],
    }), { corridor: "ring-northeast", distance: 120, side: "left", setback: 8, entranceWidth: 17 }),
    placeAlongCorridor("north-homes", roadsideSettlement({
      buildings: 4,
      colors: [0xc78f71, 0xd0b784, 0x748f8c],
    }), { corridor: "ring-northwest", distance: 80, side: "left", setback: 8 }),
  ],
  buildings: [
    { x: 150, z: 95, width: 11, depth: 11, height: 27, color: 0xd06845, style: "tower" },
  ],
  trees: northpointTrees,
  streetlights: corridorSidePoints(NORTHPOINT_CORRIDORS, { spacing: 58, shoulderOffset: 4.5 }),
  barriers: [
    { x: -18, z: -41 }, { x: 18, z: -41 },
  ],
  chasePlacement: {
    preferredAreas: [
      { kind: "rectangle", x: 0, z: -300, width: 520, depth: 65 },
      { kind: "rectangle", x: 0, z: 300, width: 520, depth: 65 },
      { kind: "rectangle", x: -300, z: 0, width: 65, depth: 520 },
      { kind: "rectangle", x: 300, z: 0, width: 65, depth: 520 },
      { kind: "rectangle", x: 0, z: -180, width: 590, depth: 58 },
      { kind: "rectangle", x: 0, z: 180, width: 590, depth: 58 },
    ],
    noSpawnAreas: [
      { kind: "circle", x: 0, z: 0, radius: 46 },
      { kind: "circle", x: 150, z: 95, radius: 24 },
    ],
  },
  spawn: { source: "position", x: 0, z: -285, heading: 0 },
});
