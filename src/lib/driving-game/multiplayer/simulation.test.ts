import { describe, expect, it } from "vitest";
import { DRIVING_PROFILES } from "../driving-profiles";
import {
  areAuthoritativeDrivingPlayersReady,
  authoritativeDrivingSimulation,
  reconfigureAuthoritativeDriving,
  setAuthoritativeDrivingPaused,
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

  it("converts network steering intent to the vehicle presentation convention", () => {
    const state = authoritativeDrivingSimulation.create(config());
    authoritativeDrivingSimulation.addPlayer(state, "driver");
    authoritativeDrivingSimulation.input(state, "driver", {
      steering: -1,
      throttle: 0,
      brake: false,
      handbrake: false,
    });
    expect(authoritativeDrivingSimulation.snapshot(state).players[0].steering).toBe(1);
    authoritativeDrivingSimulation.input(state, "driver", {
      steering: 1,
      throttle: 0,
      brake: false,
      handbrake: false,
    });
    expect(authoritativeDrivingSimulation.snapshot(state).players[0].steering).toBe(-1);
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

  it("pauses, reconfigures, waits for every player, and resumes by epoch", () => {
    const state = authoritativeDrivingSimulation.create(config());
    authoritativeDrivingSimulation.addPlayer(state, "one");
    authoritativeDrivingSimulation.addPlayer(state, "two");
    setAuthoritativeDrivingPaused(state, true);
    const frozen = authoritativeDrivingSimulation.snapshot(state);
    for (let index = 0; index < 60; index++) authoritativeDrivingSimulation.tick(state, 1 / 60);
    expect(authoritativeDrivingSimulation.snapshot(state).players).toEqual(frozen.players);

    reconfigureAuthoritativeDriving(state, config({
      mapId: "crosswind",
      modeId: "cruise",
      profileId: "loose",
      spawns: [
        { x: -8, z: 0, heading: 0 },
        { x: 8, z: 0, heading: 0 },
        { x: 24, z: 0, heading: 0 },
      ],
    }));
    const configured = authoritativeDrivingSimulation.snapshot(state);
    expect(configured).toEqual(expect.objectContaining({
      configurationEpoch: 1,
      paused: true,
      mapId: "crosswind",
    }));
    authoritativeDrivingSimulation.input(state, "one", {
      steering: 0, throttle: 0, brake: false, handbrake: false, readyEpoch: 1,
    });
    expect(areAuthoritativeDrivingPlayersReady(state)).toBe(false);
    expect(() => setAuthoritativeDrivingPaused(state, false)).toThrow("connected players");
    authoritativeDrivingSimulation.input(state, "two", {
      steering: 0, throttle: 0, brake: false, handbrake: false, readyEpoch: 1,
    });
    expect(areAuthoritativeDrivingPlayersReady(state)).toBe(true);
    authoritativeDrivingSimulation.addPlayer(state, "late");
    expect(areAuthoritativeDrivingPlayersReady(state)).toBe(false);
    authoritativeDrivingSimulation.removePlayer(state, "late");
    expect(areAuthoritativeDrivingPlayersReady(state)).toBe(true);
    setAuthoritativeDrivingPaused(state, false);
    expect(authoritativeDrivingSimulation.snapshot(state).paused).toBe(false);
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
    let collision;
    for (let index = 0; index < 90 && !collision; index++) {
      collision = (authoritativeDrivingSimulation.tick(state, 1 / 60) ?? [])
        .find((event) => event.type === "collision" && event.otherPlayerId !== undefined);
    }
    expect(collision).toEqual({
      type: "collision",
      playerId: "one",
      otherPlayerId: "two",
      terminal: true,
    });
    const [one, two] = authoritativeDrivingSimulation.snapshot(state).players;
    expect(one).toEqual(expect.objectContaining({ position: [-2, 0], velocity: [0, 0], steering: 0 }));
    expect(two).toEqual(expect.objectContaining({ position: [2, 0], velocity: [0, 0], steering: 0 }));
  });
});
