import { defineDrivingMap } from "./authoring";
import { roadPath } from "./road-shaping";

const LOOP = 96;
const CORNER = 22;
const SIDE = LOOP - CORNER;

/**
 * A perimeter ring around the freight apron. Driven counterclockwise, every chicane
 * jinks outward, and the north and south sides stay straight where the spurs join.
 */
const yardLoop = roadPath({ x: 0, z: -LOOP }, Math.PI / 2)
  .straight(18).chicane(34, 7).straight(SIDE - 52)
  .arc(CORNER, -90)
  .straight(SIDE - 17).chicane(34, 7).straight(SIDE - 17)
  .arc(CORNER, -90)
  .straight(SIDE - 52).chicane(34, 7).straight(36).chicane(34, 7).straight(SIDE - 52)
  .arc(CORNER, -90)
  .straight(SIDE - 17).chicane(34, 7).straight(SIDE - 17)
  .arc(CORNER, -90)
  .straight(SIDE - 52).chicane(34, 7).straight(18)
  .points();

export const SWITCHYARD_MAP = defineDrivingMap({
  id: "switchyard",
  title: "Switchyard",
  description: "Freight lanes and transfer gaps inside a chicaned yard loop, with a jump lane.",
  worldLimit: 118,
  groundSize: 280,
  environment: {
    background: 0xc9d7d1,
    grass: 0x77785d,
    road: 0x444742,
    fogNear: 145,
    fogFar: 240,
    cameraFar: 290,
    sideCameraFar: 250,
    shadowExtent: 122,
    shadowFar: 195,
  },
  roads: [
    // One continuous apron keeps all three channels equally viable for player and police.
    { x: 0, z: 0, width: 148, depth: 148, markings: false },

    // Restrained value bands identify each lane without changing its surface behavior.
    { x: -50, z: 0, width: 30, depth: 140, markings: false, surfaceColor: 0x414744 },
    { x: 0, z: 0, width: 30, depth: 140, markings: false, surfaceColor: 0x484b45 },
    { x: 50, z: 0, width: 30, depth: 140, markings: false, surfaceColor: 0x404643 },
  ],
  corridors: [
    { id: "yard-loop", width: 12, markings: true, points: yardLoop },
    // Spurs tie the apron's north and south edges to the loop.
    { id: "north-spur", width: 12, points: [{ x: 0, z: 70 }, { x: 0, z: LOOP }], allowDeadEndStart: true },
    { id: "south-spur", width: 12, points: [{ x: 0, z: -70 }, { x: 0, z: -LOOP }], allowDeadEndStart: true },
  ],
  // A jump line down the central lane, rising north.
  ramps: [
    { x: 0, z: -24, width: 7, length: 9, height: 1.2 },
    { x: 0, z: 18, width: 7, length: 9, height: 1.35 },
  ],
  parkingLots: [
    { x: -52, z: 24, width: 16, depth: 10 },
    { x: 52, z: -22, width: 16, depth: 10 },
  ],
  buildings: [
    // Warm west divider. Short masses create two distinct transfer windows.
    { x: -24, z: -44, width: 12, depth: 22, height: 5.5, color: 0xb78c68, style: "freight" },
    { x: -24, z: -6, width: 12, depth: 28, height: 5, color: 0xa97f60, style: "freight" },
    { x: -24, z: 40, width: 12, depth: 24, height: 5.5, color: 0xc09a70, style: "freight" },

    // Cool east divider is longitudinally offset, forcing S-shaped double transfers.
    { x: 24, z: -42, width: 12, depth: 26, height: 4.5, color: 0x688b88, style: "freight" },
    { x: 24, z: 4, width: 12, depth: 22, height: 4, color: 0x789b94, style: "freight" },
    { x: 24, z: 42, width: 12, depth: 20, height: 4.5, color: 0x5f817f, style: "freight" },

    // Global north-west landmark sits outside the transfer network.
    { x: -62, z: 56, width: 8, depth: 8, height: 20, color: 0xd06b43, style: "tower" },
  ],
  trees: [],
  streetlights: [],
  barriers: [],
  spawn: { source: "position", x: -50, z: -46, heading: 0 },
});
