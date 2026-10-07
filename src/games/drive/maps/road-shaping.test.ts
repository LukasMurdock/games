import { describe, expect, it } from "vitest";
import { placeAlongCorridor, rampPark } from "./authoring";
import { MINIMUM_SEGMENT, roadPath, shapeNetwork } from "./road-shaping";
import type { RoadCorridorDefinition } from "./types";

function segmentLengths(points: readonly { x: number; z: number }[]) {
  return points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.z - points[index].z));
}

describe("roadPath", () => {
  it("turns right for positive arcs and ends on the circle", () => {
    const path = roadPath({ x: 0, z: 0 }, 0).arc(20, 90);
    expect(path.end.x).toBeCloseTo(20, 5);
    expect(path.end.z).toBeCloseTo(20, 5);
    expect(path.end.heading).toBeCloseTo(Math.PI / 2, 5);
  });

  it("shifts sideways with S-bends and returns to the line with chicanes", () => {
    const shifted = roadPath({ x: 0, z: 0 }, 0).sBend(40, 10).end;
    expect(shifted.x).toBeCloseTo(10, 5);
    expect(shifted.z).toBeCloseTo(40, 5);
    expect(shifted.heading).toBeCloseTo(0, 5);
    const returned = roadPath({ x: 0, z: 0 }, 0).chicane(40, 8).end;
    expect(returned.x).toBeCloseTo(0, 5);
    expect(returned.z).toBeCloseTo(40, 5);
  });

  it("stacks switchbacks sideways by two radii per hairpin", () => {
    const end = roadPath({ x: 0, z: 0 }, Math.PI / 2).switchbacks(2, 50, 10, -1).end;
    expect(end.z).toBeCloseTo(40, 5);
    expect(end.heading).toBeCloseTo(Math.PI / 2, 5);
  });

  it("never emits segments shorter than the validator allows", () => {
    const points = roadPath({ x: 0, z: 0 }, 0).straight(30).chicane(34, 7).switchbacks(3, 40, 9).points();
    expect(Math.min(...segmentLengths(points))).toBeGreaterThanOrEqual(MINIMUM_SEGMENT - 1e-9);
  });
});

describe("shapeNetwork", () => {
  const corridors: RoadCorridorDefinition[] = [
    { id: "long", width: 14, points: [{ x: -300, z: 0 }, { x: 300, z: 0 }] },
    { id: "cross", width: 12, points: [{ x: 0, z: -200 }, { x: 0, z: 200 }] },
  ];

  it("bends long runs but keeps ends, crossings, and segment spacing", () => {
    const { corridors: shaped } = shapeNetwork(corridors, [], { seed: 7 });
    const long = shaped[0].points;
    expect(long[0]).toEqual({ x: -300, z: 0 });
    expect(long[long.length - 1]).toEqual({ x: 300, z: 0 });
    // The crossing with "cross" stays on the original line.
    const nearCrossing = long.filter((point) => Math.abs(point.x) < 10);
    expect(nearCrossing.every((point) => Math.abs(point.z) < 1e-6)).toBe(true);
    // Somewhere along the free runs the road leaves its original line.
    expect(Math.max(...long.map((point) => Math.abs(point.z)))).toBeGreaterThan(10);
    expect(Math.min(...segmentLengths(long))).toBeGreaterThanOrEqual(MINIMUM_SEGMENT - 1e-9);
  });

  it("keeps district frontage straight and remaps its distance", () => {
    const district = placeAlongCorridor("park", rampPark({ width: 20, depth: 30, kickers: 1 }), {
      corridor: "long",
      distance: 120,
      side: "left",
    });
    const { corridors: shaped, districts } = shapeNetwork(corridors, [district], { seed: 7 });
    const frontage = shaped[0].points.filter((point) => point.x > -230 && point.x < -130);
    expect(frontage.every((point) => Math.abs(point.z) < 1e-6)).toBe(true);
    const remapped = districts[0];
    expect(remapped.kind === "corridor" && remapped.distance).toBeCloseTo(120, 0);
  });
});
