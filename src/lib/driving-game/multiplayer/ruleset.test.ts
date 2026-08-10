import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { GAME_MAPS } from "../maps";
import { buildWorld } from "../world/build-world";
import { createDrivingWorldQuery } from "../world/driving-world-query";
import {
  PRODUCTION_DRIVING_COMPOSITION,
  createMultiplayerDrivingConfig,
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

  it("validates a clear starting grid on every registered map", () => {
    for (const map of Object.values(GAME_MAPS)) {
      const worldRuntime = buildWorld(new THREE.Scene(), map);
      expect(() => createMultiplayerDrivingConfig(
        createDrivingWorldQuery(worldRuntime),
        map.id,
      )).not.toThrow();
      worldRuntime.destroy();
    }
  });

  it("fails closed when a grid position is not clear pavement", () => {
    expect(() => createProductionDrivingConfig({
      ...world,
      isOnPavement: (x) => x < 10,
    })).toThrow("starting grid is not clear pavement");
  });
});
