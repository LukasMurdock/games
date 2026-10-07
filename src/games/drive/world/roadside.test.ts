import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { GAME_MAPS } from "../maps";
import { buildWorld } from "./build-world";

describe("roadside dressing", () => {
  it("is deterministic and keeps every spawn clear", () => {
    for (const map of Object.values(GAME_MAPS)) {
      const first = buildWorld(new THREE.Scene(), map);
      const second = buildWorld(new THREE.Scene(), map);
      expect(second.getDiagnostics().roadside, map.id).toEqual(first.getDiagnostics().roadside);
      expect(first.queryCollision(first.spawnPosition, 1.2), map.id).toBeNull();

      const stats = first.getDiagnostics().roadside!;
      expect(stats.poles + stats.chevrons + stats.tufts + stats.sidewalkTiles, map.id).toBeGreaterThan(0);
      first.destroy();
      second.destroy();
    }
  });

  it("dresses large maps with rural and urban detail", () => {
    for (const id of ["high-plains", "metro-ring", "northpoint"] as const) {
      const world = buildWorld(new THREE.Scene(), GAME_MAPS[id]);
      const stats = world.getDiagnostics().roadside!;
      expect(stats.poles, id).toBeGreaterThan(50);
      expect(stats.sidewalkTiles, id).toBeGreaterThan(50);
      expect(stats.fields, id).toBeGreaterThan(0);
      world.destroy();
    }
  });
});
