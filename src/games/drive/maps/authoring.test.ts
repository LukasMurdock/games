import { describe, expect, it } from "vitest";
import { compileCorridorJunctions } from "../world/roads";
import {
  defineDrivingMap,
  placeAlongCorridor,
  serviceYard,
  type DrivingMapSource,
} from "./authoring";
import { GAME_MAPS } from "./index";
import type { GameMapDefinition, RoadCorridorDefinition } from "./types";

const ENVIRONMENT = {
  background: 0xffffff,
  grass: 0x667744,
  road: 0x333333,
  fogNear: 100,
  fogFar: 200,
  cameraFar: 220,
  sideCameraFar: 200,
  shadowExtent: 40,
  shadowFar: 120,
};

function source(overrides: Partial<DrivingMapSource>): DrivingMapSource {
  return {
    id: "fixture",
    title: "Fixture",
    description: "Map compiler fixture.",
    worldLimit: 200,
    groundSize: 420,
    environment: ENVIRONMENT,
    corridors: [],
    spawn: { source: "position", x: 0, z: 0, heading: 0 },
    ...overrides,
  };
}

describe("driving map authoring", () => {
  it("reports connected right-angle crossings without an acute warning", () => {
    const map = defineDrivingMap(source({
      corridors: [
        { id: "east-west", width: 18, points: [{ x: -150, z: 0 }, { x: 150, z: 0 }] },
        { id: "north-south", width: 16, points: [{ x: 0, z: -150 }, { x: 0, z: 150 }] },
      ],
    }));

    expect(map.layoutDiagnostics).toMatchObject({
      intersections: 1,
      connectedComponents: 1,
      acuteIntersections: 0,
    });
  });

  it("moves a roadside parcel when its requested footprint overlaps a landmark", () => {
    const map = defineDrivingMap(source({
      corridors: [{ id: "main", width: 18, points: [{ x: -150, z: 0 }, { x: 150, z: 0 }] }],
      buildings: [{ x: 0, z: 36, width: 34, depth: 34, height: 8, color: 0x999999 }],
      districts: [placeAlongCorridor(
        "service",
        serviceYard({ width: 54, depth: 42, color: 0x778899 }),
        { corridor: "main", distance: 150, side: "left" },
      )],
    }));

    expect(map.compiledDistricts?.[0].center.x).not.toBeCloseTo(0);
  });

  it("compiles multiple connected entrances and internal circulation separately", () => {
    const map = defineDrivingMap(source({
      corridors: [{ id: "main", width: 18, points: [{ x: -150, z: 0 }, { x: 150, z: 0 }] }],
      districts: [placeAlongCorridor(
        "service",
        serviceYard({ width: 62, depth: 46, color: 0x778899 }),
        {
          corridor: "main",
          distance: 150,
          side: "left",
          entranceOffsets: [-16, 16],
        },
      )],
    }));

    expect(map.compiledDistricts?.[0].entrances).toHaveLength(2);
    expect(map.layoutDiagnostics).toMatchObject({ entrances: 2, disconnectedEntrances: 0 });
    expect(map.roads.filter((road) => road.role === "internal")).toHaveLength(1);
  });

  it("classifies deliberately terminal corridors without unintended dead ends", () => {
    const map = defineDrivingMap(source({
      corridors: [{
        id: "service-road",
        width: 14,
        allowDeadEndStart: true,
        allowDeadEndEnd: true,
        points: [{ x: -100, z: 0 }, { x: 100, z: 0 }],
      }],
    }));

    expect(map.layoutDiagnostics).toMatchObject({ deadEnds: 0, intentionalDeadEnds: 2 });
  });
});

describe("registered authored maps", () => {
  it("keeps every large authored road network connected and entrance-valid", () => {
    const authoredMaps: GameMapDefinition[] = [
      GAME_MAPS["high-plains"],
      GAME_MAPS["metro-ring"],
      GAME_MAPS.northpoint,
    ];
    for (const map of authoredMaps) {
      if (!map.layoutDiagnostics) continue;
      expect(map.layoutDiagnostics.connectedComponents, map.id).toBe(1);
      expect(map.layoutDiagnostics.deadEnds, map.id).toBe(0);
      expect(map.layoutDiagnostics.disconnectedEntrances, map.id).toBe(0);
      expect(map.layoutDiagnostics.acuteIntersections, map.id).toBe(0);
    }
  });

  it("keeps compiled district metadata available for visual inspection", () => {
    for (const id of ["high-plains", "metro-ring", "northpoint"] as const) {
      const map = GAME_MAPS[id];
      expect(map.compiledDistricts?.length, id).toBeGreaterThan(0);
      expect(map.compiledDistricts?.every((district) => district.id.length > 0), id).toBe(true);
    }
  });
});

describe("corridor junction compilation", () => {
  it("merges nearby overlapping junction envelopes", () => {
    const corridors = [
      { id: "main", width: 20, points: [{ x: -100, z: 0 }, { x: 100, z: 0 }] },
      { id: "west", width: 18, points: [{ x: -8, z: -100 }, { x: -8, z: 100 }] },
      { id: "east", width: 18, points: [{ x: 8, z: -100 }, { x: 8, z: 100 }] },
    ] satisfies readonly RoadCorridorDefinition[];

    const junctions = compileCorridorJunctions(corridors);
    expect(junctions).toHaveLength(1);
    expect(junctions[0].radius).toBeGreaterThan(17);
  });

  it("deduplicates a shared endpoint junction", () => {
    const corridors = [
      { id: "first", width: 16, points: [{ x: -100, z: 0 }, { x: 0, z: 0 }] },
      { id: "second", width: 16, points: [{ x: 0, z: 0 }, { x: 80, z: 60 }] },
      { id: "branch", width: 14, points: [{ x: 0, z: 0 }, { x: 0, z: -100 }] },
    ] satisfies readonly RoadCorridorDefinition[];

    expect(compileCorridorJunctions(corridors)).toHaveLength(1);
  });
});
