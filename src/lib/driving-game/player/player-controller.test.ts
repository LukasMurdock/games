import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DRIVING_PROFILES } from "../driving-profiles";
import type { WorldRuntime } from "../world/types";
import { createPlayerController } from "./player-controller";

function createWorld(overrides: Partial<WorldRuntime> = {}): WorldRuntime {
  return {
    spawnPosition: new THREE.Vector3(0, 0.06, 0),
    spawnHeading: 0,
    isOnPavement: () => true,
    queryCollision: () => null,
    findSafePlacement: () => null,
    isOutsideBoundary: () => false,
    getDiagnostics: () => ({
      buildMilliseconds: 0,
      obstacles: 0,
      pavementPrimitives: 0,
      junctions: 0,
      accessRoads: 0,
      collisionQueries: 0,
      collisionCandidates: 0,
      pavementQueries: 0,
      pavementCandidates: 0,
    }),
    setDebugLayer: () => undefined,
    destroy: () => undefined,
    ...overrides,
  };
}

function createController(options: {
  controlMode?: "automatic" | "manual";
  world?: WorldRuntime;
  onEvent?: (event: Parameters<Parameters<typeof createPlayerController>[0]["onEvent"]>[0]) => void;
  onResetRequested?: () => void;
} = {}) {
  return createPlayerController({
    world: options.world ?? createWorld(),
    profile: DRIVING_PROFILES.balanced,
    controlMode: options.controlMode ?? "automatic",
    onEvent: options.onEvent ?? (() => undefined),
    onResetRequested: options.onResetRequested ?? (() => undefined),
  });
}

describe("single-player driving characterization", () => {
  it("automatic mode accelerates forward and respects maximum speed", () => {
    const player = createController();
    for (let index = 0; index < 600; index++) player.update(1 / 60);
    const snapshot = player.getSnapshot();
    expect(snapshot.position.z).toBeGreaterThan(100);
    expect(snapshot.speed).toBeGreaterThan(20);
    expect(snapshot.speed).toBeLessThanOrEqual(DRIVING_PROFILES.balanced.maximumSpeed);
  });

  it("manual mode remains stopped until acceleration is pressed", () => {
    const player = createController({ controlMode: "manual" });
    for (let index = 0; index < 60; index++) player.update(1 / 60);
    expect(player.getSnapshot().speed).toBe(0);
    player.setControl("accelerate", true);
    for (let index = 0; index < 60; index++) player.update(1 / 60);
    expect(player.getSnapshot().speed).toBeGreaterThan(5);
  });

  it("enters a drift from authoritative control state", () => {
    const phases: string[] = [];
    const player = createController({
      onEvent: (event) => {
        if (event.type === "drift-phase") phases.push(event.phase);
      },
    });
    for (let index = 0; index < 45; index++) player.update(1 / 60);
    player.setControl("left", true);
    player.setControl("handbrake", true);
    for (let index = 0; index < 20; index++) player.update(1 / 60);
    expect(phases).toContain("breakaway");
    expect(phases).toContain("sustain");
  });

  it("recognizes a deterministic hard-drift double tap", () => {
    const phases: string[] = [];
    const player = createController({
      onEvent: (event) => {
        if (event.type === "drift-phase") phases.push(event.phase);
      },
    });
    for (let index = 0; index < 45; index++) player.update(1 / 60);
    player.setControl("left", true);
    player.setControl("left", false);
    for (let index = 0; index < 6; index++) player.update(1 / 60);
    player.setControl("left", true);
    player.update(1 / 60);
    expect(phases).toContain("breakaway");
  });

  it("applies additional drag away from pavement", () => {
    const pavement = createController();
    const offRoad = createController({ world: createWorld({ isOnPavement: () => false }) });
    for (let index = 0; index < 300; index++) {
      pavement.update(1 / 60);
      offRoad.update(1 / 60);
    }
    expect(offRoad.getSnapshot().speed).toBeLessThan(pavement.getSnapshot().speed);
  });

  it("requests a reset when the world boundary is crossed", () => {
    let resets = 0;
    const player = createController({
      world: createWorld({ isOutsideBoundary: (position) => position.z > 1 }),
      onResetRequested: () => { resets += 1; },
    });
    for (let index = 0; index < 60 && resets === 0; index++) player.update(1 / 60);
    expect(resets).toBe(1);
  });
});
