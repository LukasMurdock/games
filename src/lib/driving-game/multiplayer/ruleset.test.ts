import { describe, expect, it } from "vitest";
import {
  PRODUCTION_DRIVING_COMPOSITION,
  createProductionDrivingConfig,
  createStartingGrid,
} from "./ruleset";

const world = {
  spawn: { x: 10, z: 20, heading: 0 },
  isOnPavement: () => true,
  queryCollision: () => null,
  isOutsideBoundary: () => false,
};

describe("production driving ruleset composition", () => {
  it("binds the first release composition", () => {
    expect(PRODUCTION_DRIVING_COMPOSITION).toEqual({
      mapId: "city-circuit",
      modeId: "cruise",
      profileId: "loose",
      controlMode: "automatic",
      tickRate: 60,
      snapshotRate: 20,
    });
  });

  it("creates eight deterministic non-overlapping grid positions", () => {
    const first = createStartingGrid(world);
    expect(first).toEqual(createStartingGrid(world));
    expect(first).toHaveLength(8);
    for (let left = 0; left < first.length; left++) {
      for (let right = left + 1; right < first.length; right++) {
        expect(Math.hypot(first[left].x - first[right].x, first[left].z - first[right].z))
          .toBeGreaterThanOrEqual(2.5);
      }
    }
    expect(createProductionDrivingConfig(world).spawns).toEqual(first);
  });

  it("fails closed when a grid position is not clear pavement", () => {
    expect(() => createProductionDrivingConfig({
      ...world,
      isOnPavement: (x) => x < 10,
    })).toThrow("starting grid is not clear pavement");
  });
});
