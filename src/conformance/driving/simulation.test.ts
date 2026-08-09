import { describe, expect, it } from "vitest";
import { drivingSimulation } from "./simulation";

describe("authoritative driving simulation", () => {
  it("moves only from bounded player intent", () => {
    const state = drivingSimulation.create({});
    drivingSimulation.addPlayer(state, "driver");
    const start = drivingSimulation.snapshot(state).players[0];
    drivingSimulation.input(state, "driver", {
      steering: 4,
      throttle: 4,
      brake: false,
      handbrake: false,
    });
    for (let index = 0; index < 60; index++) drivingSimulation.tick(state, 1 / 60);
    const player = drivingSimulation.snapshot(state).players[0];
    expect(player.position[1]).toBeGreaterThan(start.position[1]);
    expect(player.speed).toBeLessThanOrEqual(28);
    expect(player.heading).toBeGreaterThan(0);
  });

  it("is deterministic for the same inputs and fixed steps", () => {
    const run = () => {
      const state = drivingSimulation.create({});
      drivingSimulation.addPlayer(state, "driver");
      drivingSimulation.input(state, "driver", {
        steering: -0.5,
        throttle: 1,
        brake: false,
        handbrake: true,
      });
      for (let index = 0; index < 180; index++) drivingSimulation.tick(state, 1 / 60);
      return drivingSimulation.snapshot(state);
    };
    expect(run()).toEqual(run());
  });

  it("separates overlapping players and reports lifecycle events", () => {
    const state = drivingSimulation.create({ spawnSpacing: 0 });
    expect(drivingSimulation.addPlayer(state, "one")).toEqual([{ type: "joined", playerId: "one" }]);
    drivingSimulation.addPlayer(state, "two");
    drivingSimulation.tick(state, 1 / 60);
    const [one, two] = drivingSimulation.snapshot(state).players;
    expect(Math.hypot(one.position[0] - two.position[0], one.position[1] - two.position[1]))
      .toBeCloseTo(2.5);
    expect(drivingSimulation.removePlayer(state, "two")).toEqual([{ type: "left", playerId: "two" }]);
  });
});
