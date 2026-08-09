import { defineDrivingMap } from "./authoring";

export const CROSSWIND_MAP = defineDrivingMap({
  id: "crosswind",
  title: "Crosswind",
  description: "Aprons, crossed taxiways, and a service cut.",
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
  ],
  parkingLots: [
    { x: -74, z: 25, width: 18, depth: 12 },
    { x: 73, z: -24, width: 20, depth: 12 },
  ],
  buildings: [
    { x: -55, z: 0, width: 18, depth: 26, height: 9, color: 0xd5c39b, style: "hangar" },
    { x: 55, z: 10, width: 24, depth: 12, height: 7, color: 0x758e88, style: "hangar" },
    { x: 62, z: -17, width: 10, depth: 14, height: 5, color: 0xc97952 },
    { x: 0, z: 34, width: 9, depth: 9, height: 22, color: 0xd65b37, style: "tower" },
  ],
  barriers: [
    { x: -12, z: -34.6 },
    { x: -12, z: -27.4 },
    { x: 12, z: -34.6 },
    { x: 12, z: -27.4 },
  ],
  trees: [],
  streetlights: [],
  spawn: { source: "position", x: -80, z: 0, heading: 0 },
});
