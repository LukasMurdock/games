import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { GAME_MAPS } from "../maps";
import { buildWorld } from "./build-world";
import { createSurfaceQuery, rampProfile } from "./set-pieces";

describe("ramps", () => {
  it("rise, crest, and drop back to the ground", () => {
    expect(rampProfile(-5, 10, 1.2)).toBe(0);
    expect(rampProfile(-2.6, 10, 1.2)).toBeCloseTo(0.6, 5);
    expect(rampProfile(0, 10, 1.2)).toBeCloseTo(1.2, 5);
    expect(rampProfile(4.99, 10, 1.2)).toBeLessThan(0.01);
    expect(rampProfile(6, 10, 1.2)).toBe(0);
  });

  it("report surface height only within their rotated footprint", () => {
    const heightAt = createSurfaceQuery([{ x: 10, z: 0, width: 6, length: 10, height: 1.5, rotation: Math.PI / 2 }]);
    // Rotated a quarter turn, the ramp rises toward +x.
    expect(heightAt(10, 0)).toBeCloseTo(1.5, 1);
    expect(heightAt(6, 0)).toBeGreaterThan(0);
    expect(heightAt(6, 0)).toBeLessThan(1);
    expect(heightAt(10, 4)).toBe(0);
    expect(heightAt(0, 0)).toBe(0);
  });
});

describe("map set pieces", () => {
  it("keep every road clear of run-ending props", () => {
    for (const map of Object.values(GAME_MAPS)) {
      const world = buildWorld(new THREE.Scene(), map);
      const probe = new THREE.Vector3();
      const blocked: string[] = [];
      for (const corridor of map.corridors ?? []) {
        for (let index = 1; index < corridor.points.length; index++) {
          const start = corridor.points[index - 1];
          const end = corridor.points[index];
          const length = Math.hypot(end.x - start.x, end.z - start.z);
          for (let along = 0; along <= length; along += 3) {
            probe.set(start.x + (end.x - start.x) * along / length, 0, start.z + (end.z - start.z) * along / length);
            const hit = world.queryCollision(probe, 1);
            if (hit && hit.kind !== "building") blocked.push(`${corridor.id}@${probe.x.toFixed(0)},${probe.z.toFixed(0)}:${hit.kind}`);
          }
        }
      }
      expect(blocked, map.id).toEqual([]);
      world.destroy();
    }
  });

  it("gives every map at least one drift pad, ramp, or switchback road", () => {
    for (const map of Object.values(GAME_MAPS)) {
      const setPieces = (map.pads?.length ?? 0) + (map.ramps?.length ?? 0);
      expect(setPieces, map.id).toBeGreaterThan(0);
    }
  });
});
