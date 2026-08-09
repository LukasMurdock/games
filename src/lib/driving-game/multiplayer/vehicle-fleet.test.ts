import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { AuthoritativeDrivingPlayer } from "./simulation";
import { createAuthoritativeVehicleFleet } from "./vehicle-fleet";

function player(playerId: string, x: number): AuthoritativeDrivingPlayer {
  return {
    playerId,
    position: [x, 0],
    velocity: [1, 0],
    heading: Math.PI / 2,
    speed: 1,
    visualSlip: 0,
    driftPhase: "grip",
    boosting: false,
    exitPulse: 0,
  };
}

describe("authoritative vehicle fleet presentation", () => {
  it("creates, updates, and removes one render-only car per snapshot player", () => {
    const scene = new THREE.Scene();
    const fleet = createAuthoritativeVehicleFleet(scene);
    fleet.update({ players: [player("one", 0), player("two", 4)] }, 1 / 60);
    expect(fleet.size).toBe(2);
    expect(scene.children).toHaveLength(2);
    fleet.update({ players: [player("two", 5)] }, 1 / 60);
    expect(fleet.size).toBe(1);
    expect(scene.children).toHaveLength(1);
    fleet.destroy();
    expect(fleet.size).toBe(0);
    expect(scene.children).toHaveLength(0);
  });
});
