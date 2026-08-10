import type { GameMapDefinition } from "./types";

const cityRoads = [-60, -30, 0, 30, 60];

export const CITY_CIRCUIT_MAP = {
  id: "city-circuit",
  title: "Circuit City",
  description: "Streets, lots, and an outer circuit.",
  worldLimit: 150,
  groundSize: 360,
  environment: {
    background: 0xc8e3df,
    grass: 0x68751b,
    road: 0x3b3d35,
    fogNear: 175,
    fogFar: 300,
    cameraFar: 350,
    sideCameraFar: 300,
    shadowExtent: 155,
    shadowFar: 240,
  },
  roads: [
    ...cityRoads.map((z) => ({ x: 0, z, width: 150, depth: 16, markings: true })),
    ...cityRoads.map((x) => ({ x, z: 0, width: 16, depth: x === 0 ? 240 : 150, markings: true })),

    // A shorter, less forgiving link from the civic north road to the east avenue.
    // Its endpoints land in existing intersections, preserving readable alternatives.
    { x: 15, z: 15, width: 42, depth: 8.5, rotation: Math.PI / 4, markings: false, surfaceColor: 0x49483f },
  ],
  parkingLots: [
    { x: -15, z: -15, width: 14, depth: 14 },
    // The larger southeast plaza supports wider transitions around the barrier slalom.
    { x: 15, z: -15, width: 18, depth: 18 },
    { x: -15, z: 15, width: 14, depth: 14 },
  ],
  buildings: [
    // The southern edge mixes low service buildings with one recognizable depot.
    { x: -45, z: -45, width: 12, depth: 12, height: 9, color: 0xa98272 },
    { x: -15, z: -45, width: 13, depth: 12, height: 14, color: 0x8ca3a0 },
    { x: 15, z: -45, width: 12, depth: 12, height: 8, color: 0xb9aa83 },
    { x: 45, z: -45, width: 13, depth: 12, height: 8, color: 0x6f8d8b, style: "hangar" },

    // Warm west and cool east facades make orientation possible at close range.
    { x: -45, z: -15, width: 12, depth: 13, height: 13, color: 0xcb7958 },
    { x: 45, z: -15, width: 12, depth: 13, height: 10, color: 0x708f83 },
    { x: -45, z: 15, width: 12, depth: 12, height: 8, color: 0xb8674f },
    { x: 45, z: 15, width: 13, depth: 12, height: 15, color: 0x64858b },

    // A gold civic building anchors north; its footprint and collision stay unchanged.
    { x: -45, z: 45, width: 12, depth: 13, height: 12, color: 0xd19a63 },
    { x: -15, z: 45, width: 13, depth: 12, height: 24, color: 0xd7ae58 },
    { x: 15, z: 45, width: 12, depth: 13, height: 13, color: 0xd3c38e },
    { x: 45, z: 45, width: 13, depth: 13, height: 9, color: 0x71819a },
  ],
  // Keep terminal decorative obstacles away from central drift and recovery lines.
  trees: [
    { x: -72, z: -72 }, { x: 72, z: -72 }, { x: -72, z: 72 }, { x: 72, z: 72 },
  ],
  streetlights: [
    { x: -50, z: -73 }, { x: -20, z: -73 }, { x: 10, z: -73 }, { x: 40, z: -73 },
    { x: 73, z: -50 }, { x: 73, z: -20 }, { x: 73, z: 10 }, { x: 73, z: 40 },
    { x: 50, z: 73 }, { x: 20, z: 73 }, { x: -10, z: 73 }, { x: -40, z: 73 },
    { x: -73, z: 50 }, { x: -73, z: 20 }, { x: -73, z: -10 }, { x: -73, z: -40 },
  ],
  barriers: Array.from({ length: 4 }, (_, index) => [
    { x: 10 + index * 3.4, z: -17 + (index % 2) * 4 },
    { x: -20 + index * 3.4, z: 13 + (index % 2) * 4 },
  ]).flat(),
  circuit: [
    { kind: "acceleration", span: 0.7, radius: 114, width: 11 },
    { kind: "sweeper", span: 0.5, radius: 124, width: 12 },
    { kind: "tightening", span: 0.42, radius: 108, width: 14 },
    { kind: "cooldown", span: 0.65, radius: 121, width: 11 },
    { kind: "transition", span: 0.42, radius: 111, width: 14 },
    { kind: "sweeper", span: 0.5, radius: 127, width: 12.5 },
    { kind: "hairpin", span: 0.4, radius: 107, width: 15 },
    { kind: "acceleration", span: 0.7, radius: 120, width: 11 },
    { kind: "sweeper", span: 0.5, radius: 126, width: 12 },
    { kind: "transition", span: 0.42, radius: 109, width: 14.5 },
    { kind: "tightening", span: 0.45, radius: 123, width: 14 },
    { kind: "cooldown", span: 0.65, radius: 112, width: 11 },
    { kind: "sweeper", span: 0.5, radius: 127, width: 12.5 },
    { kind: "transition", span: 0.42, radius: 110, width: 14 },
  ],
  spawn: { source: "circuit", sampleIndex: 0 },
} satisfies GameMapDefinition;
