import { describe, expect, it } from "vitest";
import { DRIVING_PROFILES } from "../driving-profiles";
import {
  authoritativeDrivingSimulation,
  type AuthoritativeDrivingConfig,
} from "./simulation";

const openWorld = {
  spawn: { x: 0, z: 0, heading: 0 },
  isOnPavement: () => true,
  queryCollision: () => null,
  isOutsideBoundary: () => false,
};

function config(overrides: Partial<AuthoritativeDrivingConfig> = {}): AuthoritativeDrivingConfig {
  return {
    world: openWorld,
    profile: DRIVING_PROFILES.balanced,
    controlMode: "manual",
    spawns: [
      { x: -4, z: 0, heading: 0 },
      { x: 4, z: 0, heading: 0 },
    ],
    ...overrides,
  };
}

describe("production authoritative driving simulation", () => {
  it("creates one production vehicle core per player and applies only intent", () => {
    const state = authoritativeDrivingSimulation.create(config());
    authoritativeDrivingSimulation.addPlayer(state, "host");
    authoritativeDrivingSimulation.input(state, "host", {
      steering: 1,
      throttle: 1,
      brake: false,
      handbrake: false,
    });
    for (let index = 0; index < 120; index++) {
      authoritativeDrivingSimulation.tick(state, 1 / 60);
    }
    const player = authoritativeDrivingSimulation.snapshot(state).players[0];
    expect(player.playerId).toBe("host");
    expect(player.position[1]).toBeGreaterThan(10);
    expect(player.heading).toBeLessThan(0);
    expect(player.speed).toBeGreaterThan(10);
  });

  it("assigns and reuses deterministic non-overlapping spawns", () => {
    const state = authoritativeDrivingSimulation.create(config());
    expect(authoritativeDrivingSimulation.addPlayer(state, "one")).toEqual([
      { type: "joined", playerId: "one" },
    ]);
    authoritativeDrivingSimulation.addPlayer(state, "two");
    expect(authoritativeDrivingSimulation.snapshot(state).players.map((player) => player.position))
      .toEqual([[-4, 0], [4, 0]]);
    expect(authoritativeDrivingSimulation.removePlayer(state, "one")).toEqual([
      { type: "left", playerId: "one" },
    ]);
    authoritativeDrivingSimulation.addPlayer(state, "three");
    expect(authoritativeDrivingSimulation.snapshot(state).players.find((player) => player.playerId === "three")?.position)
      .toEqual([-4, 0]);
  });

  it("rejects overlapping spawn configuration", () => {
    expect(() => authoritativeDrivingSimulation.create(config({
      spawns: [{ x: 0, z: 0, heading: 0 }, { x: 1, z: 0, heading: 0 }],
    }))).toThrow("must not overlap");
  });

  it("resolves vehicle collisions authoritatively", () => {
    const state = authoritativeDrivingSimulation.create(config({
      spawns: [
        { x: -2, z: 0, heading: Math.PI / 2 },
        { x: 2, z: 0, heading: -Math.PI / 2 },
      ],
    }));
    authoritativeDrivingSimulation.addPlayer(state, "one");
    authoritativeDrivingSimulation.addPlayer(state, "two");
    for (const playerId of ["one", "two"]) {
      authoritativeDrivingSimulation.input(state, playerId, {
        steering: 0,
        throttle: 1,
        brake: false,
        handbrake: false,
      });
    }
    const events = [];
    for (let index = 0; index < 90; index++) {
      events.push(...(authoritativeDrivingSimulation.tick(state, 1 / 60) ?? []));
    }
    expect(events.some((event) => event.type === "collision" && event.otherPlayerId !== undefined))
      .toBe(true);
    const [one, two] = authoritativeDrivingSimulation.snapshot(state).players;
    expect(Math.hypot(one.position[0] - two.position[0], one.position[1] - two.position[1]))
      .toBeGreaterThanOrEqual(2.49);
  });
});
