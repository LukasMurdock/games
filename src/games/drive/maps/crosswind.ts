import { defineDrivingMap, driftPad, placeStamp } from "./authoring";
import { roadPath } from "./road-shaping";

/** Climbs north from the west apron in two tight hairpins to a lookout pad. */
const towerHill = roadPath({ x: -75, z: 41 }, 0)
  .straight(8)
  .arc(10, 90)
  .switchbacks(2, 70, 10, -1)
  .points();

/** A southern loop between the aprons: two sweepers and a double S-bend. */
const perimeterEsses = roadPath({ x: -70, z: -41 }, Math.PI)
  .straight(15)
  .arc(24, -90)
  .straight(20)
  .sBend(36, 12)
  .sBend(36, -12)
  .arc(24, -90)
  .straight(15)
  .points();

export const CROSSWIND_MAP = defineDrivingMap({
  id: "crosswind",
  title: "Crosswind",
  description: "Aprons and crossed taxiways, hairpins up Tower Hill, and a southern esses loop.",
  worldLimit: 118,
  groundSize: 280,
  environment: {
    background: 0xc7ddd7,
    grass: 0x9b855f,
    road: 0x454947,
    fogNear: 140,
    fogFar: 235,
    cameraFar: 285,
    sideCameraFar: 245,
    shadowExtent: 122,
    shadowFar: 195,
  },
  roads: [
    // Two broad handling spaces make room for sweepers, reversals, and recovery.
    { x: -55, z: 0, width: 70, depth: 82, markings: false },
    { x: 55, z: 0, width: 70, depth: 82, markings: false },
  ],
  corridors: [
    {
      id: "northwest-southeast-taxiway",
      width: 18,
      markings: "taxiway",
      points: [{ x: -62, z: 22.6 }, { x: 62, z: -22.6 }],
    },
    {
      id: "southwest-northeast-taxiway",
      width: 18,
      markings: "taxiway",
      points: [{ x: -62, z: -22.6 }, { x: 62, z: 22.6 }],
    },
    {
      id: "service-cut",
      width: 9,
      surfaceColor: 0x514b3f,
      points: [{ x: -56, z: -31 }, { x: 56, z: -31 }],
    },
    // Both set-piece roads start or end on apron pavement or the lookout pad.
    { id: "tower-hill", width: 11, markings: true, points: towerHill, allowDeadEndStart: true, allowDeadEndEnd: true },
    { id: "perimeter-esses", width: 12, markings: true, points: perimeterEsses, allowDeadEndStart: true, allowDeadEndEnd: true },
  ],
  districts: [
    placeStamp("tower-lookout", driftPad({ radius: 14, color: 0x4b4d48 }), { x: 19, z: 99 }),
  ],
  // A jump line across the east apron, rising toward the east.
  ramps: [
    { x: 38, z: -12, width: 7, length: 9, height: 1.2, rotation: Math.PI / 2 },
    { x: 68, z: -12, width: 7, length: 9, height: 1.35, rotation: Math.PI / 2 },
  ],
  parkingLots: [
    { x: -74, z: 25, width: 18, depth: 12 },
    { x: 73, z: -30, width: 20, depth: 12 },
  ],
  buildings: [
    { x: -55, z: 0, width: 18, depth: 26, height: 9, color: 0xd5c39b, style: "hangar" },
    { x: 55, z: 14, width: 24, depth: 12, height: 7, color: 0x758e88, style: "hangar" },
    { x: 0, z: 34, width: 9, depth: 9, height: 22, color: 0xd65b37, style: "tower" },
    { x: 46, z: 84, width: 10, depth: 10, height: 6, color: 0xc97952 },
  ],
  barriers: [
    { x: -12, z: -34.6 },
    { x: -12, z: -27.4 },
    { x: 12, z: -34.6 },
    { x: 12, z: -27.4 },
  ],
  // Keep the hairpins clear: trees stay outside the switchback stack.
  trees: [
    { x: -100, z: 70 }, { x: -96, z: 96 }, { x: 52, z: 70 },
    { x: -30, z: -62 }, { x: 30, z: -62 }, { x: 0, z: -105 },
  ],
  streetlights: [],
  spawn: { source: "position", x: -80, z: 0, heading: 0 },
});
