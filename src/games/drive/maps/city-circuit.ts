import { defineDrivingMap, driftPad, placeStamp, rampPark } from "./authoring";
import { roadPath } from "./road-shaping";
import type { RoadCorridorDefinition } from "./types";

const LOOP = 58;
const LOOP_CORNER = 22;
/** Where each avenue meets the drift circuit's centerline, measured from the built course. */
const CIRCUIT_EAST_WEST = 117.8;
const CIRCUIT_NORTH = 120.4;
const CIRCUIT_SOUTH = 114;

/** A rounded inner ring road; its corners are wide enough to hold a drift through. */
const innerLoop = roadPath({ x: 0, z: -LOOP }, Math.PI / 2)
  .straight(LOOP - LOOP_CORNER)
  .arc(LOOP_CORNER, -90)
  .straight(2 * (LOOP - LOOP_CORNER))
  .arc(LOOP_CORNER, -90)
  .straight(2 * (LOOP - LOOP_CORNER))
  .arc(LOOP_CORNER, -90)
  .straight(2 * (LOOP - LOOP_CORNER))
  .arc(LOOP_CORNER, -90)
  .straight(LOOP - LOOP_CORNER)
  .points();

/**
 * Cross avenues run from the outer circuit to the central pad. Each has a tight
 * chicane on either side of the pad and stays straight where it crosses the loop.
 */
const mainStreet = roadPath({ x: -CIRCUIT_EAST_WEST, z: 0 }, Math.PI / 2)
  .straight(CIRCUIT_EAST_WEST - 50)
  .chicane(34, -8)
  .straight(32)
  .chicane(34, -8)
  .straight(CIRCUIT_EAST_WEST - 50)
  .points();

const civicAvenue = roadPath({ x: 0, z: -CIRCUIT_SOUTH }, 0)
  .straight(CIRCUIT_SOUTH - 50)
  .chicane(34, 7)
  .straight(32)
  .chicane(34, -7)
  .straight(CIRCUIT_NORTH - 50)
  .points();

const corridors: RoadCorridorDefinition[] = [
  { id: "inner-loop", width: 13, markings: true, points: innerLoop },
  // Both avenues meet the drift circuit's pavement rather than another corridor.
  { id: "main-street", width: 12, markings: true, points: mainStreet, allowDeadEndStart: true, allowDeadEndEnd: true },
  { id: "civic-avenue", width: 12, markings: true, points: civicAvenue, allowDeadEndStart: true, allowDeadEndEnd: true },
];

export const CITY_CIRCUIT_MAP = defineDrivingMap({
  id: "city-circuit",
  title: "Circuit City",
  description: "A drift circuit around a chicaned downtown, a central pad, and a jump lot.",
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
  corridors,
  districts: [
    placeStamp("central-pad", driftPad({ radius: 18, color: 0x45463f }), { x: 0, z: 0 }),
    // Rotated so the jump line rises toward the south, the way cars enter from Main Street.
    placeStamp("jump-lot", rampPark({ width: 24, depth: 38, kickers: 1 }), { x: -30, z: -31 }, Math.PI),
  ],
  buildings: [
    // Northeast: a stepped office pair facing Main Street's northward jink.
    { x: 26, z: 36, width: 13, depth: 13, height: 16, color: 0x64858b },
    { x: 44, z: 26, width: 10, depth: 14, height: 9, color: 0x708f83 },
    // Southeast: a tall gateway tower beside the avenue's eastward jink.
    { x: 34, z: -38, width: 14, depth: 12, height: 22, color: 0x8ca3a0 },
    { x: 36, z: -20, width: 12, depth: 9, height: 8, color: 0xb9aa83 },
    // Northwest: the gold civic landmark.
    { x: -36, z: 36, width: 16, depth: 16, height: 24, color: 0xd7ae58 },
    // Between the loop and the circuit, one low block per quarter.
    { x: 74, z: 38, width: 12, depth: 12, height: 9, color: 0xcb7958 },
    { x: -74, z: -38, width: 12, depth: 13, height: 12, color: 0xb8674f },
    { x: 38, z: -74, width: 13, depth: 11, height: 8, color: 0x71819a },
    { x: -40, z: 74, width: 12, depth: 12, height: 10, color: 0xa98272 },
    { x: 80, z: -30, width: 14, depth: 18, height: 8, color: 0x6f8d8b, style: "hangar" },
  ],
  trees: [
    { x: -76, z: 20 }, { x: -70, z: 56 }, { x: 70, z: -56 }, { x: 76, z: -10 },
    { x: 20, z: 78 }, { x: -20, z: -80 }, { x: 58, z: 72 }, { x: -60, z: -72 },
  ],
  streetlights: [
    { x: -LOOP - 9, z: -20 }, { x: -LOOP - 9, z: 20 }, { x: LOOP + 9, z: -20 }, { x: LOOP + 9, z: 20 },
    { x: -20, z: -LOOP - 9 }, { x: 20, z: -LOOP - 9 }, { x: -20, z: LOOP + 9 }, { x: 20, z: LOOP + 9 },
  ],
  barriers: [],
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
});
