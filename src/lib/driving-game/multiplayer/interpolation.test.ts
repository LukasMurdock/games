import { describe, expect, it } from "vitest";
import { DrivingSnapshotBuffer, interpolateSnapshot } from "./interpolation";
import type { AuthoritativeDrivingPlayer } from "./simulation";

function player(
  playerId: string,
  position: [number, number],
  overrides: Partial<AuthoritativeDrivingPlayer> = {},
): AuthoritativeDrivingPlayer {
  return {
    playerId,
    position,
    velocity: [10, 0],
    heading: 0,
    speed: 10,
    visualSlip: 0,
    driftPhase: "grip",
    boosting: false,
    exitPulse: 0,
    ...overrides,
  };
}

describe("driving snapshot interpolation", () => {
  it("samples behind the latest authoritative tick", () => {
    let now = 1_000;
    const buffer = new DrivingSnapshotBuffer({ now: () => now });
    buffer.push(0, { players: [player("one", [0, 0])] });
    buffer.push(6, { players: [player("one", [6, 0])] });
    buffer.push(12, { players: [player("one", [12, 0])] });
    expect(buffer.sample()?.players[0].position[0]).toBe(6);
    now += 50;
    expect(buffer.sample()?.players[0].position[0]).toBe(9);
  });

  it("interpolates heading over the shortest wraparound arc", () => {
    const result = interpolateSnapshot(
      { players: [player("one", [0, 0], { heading: Math.PI - 0.1 })] },
      { players: [player("one", [1, 0], { heading: -Math.PI + 0.1 })] },
      0.5,
    );
    expect(Math.abs(result.players[0].heading)).toBeCloseTo(Math.PI);
  });

  it("does not move the render clock backward when a snapshot arrives late", () => {
    let now = 1_000;
    const buffer = new DrivingSnapshotBuffer({
      now: () => now,
      interpolationDelaySeconds: 0,
    });
    buffer.push(0, { players: [player("one", [0, 0])] });
    now = 1_070;
    const beforeLatePacket = buffer.sample()?.players[0].position[0] ?? 0;
    now = 1_080;
    buffer.push(3, { players: [player("one", [3, 0])] });
    const afterLatePacket = buffer.sample()?.players[0].position[0] ?? 0;
    expect(afterLatePacket).toBeGreaterThanOrEqual(beforeLatePacket);
  });

  it("bounds extrapolation when snapshots are delayed", () => {
    let now = 1_000;
    const buffer = new DrivingSnapshotBuffer({
      now: () => now,
      interpolationDelaySeconds: 0,
      maximumExtrapolationSeconds: 0.1,
    });
    buffer.push(10, { players: [player("one", [5, 0])] });
    now += 1_000;
    expect(buffer.sample()?.players[0].position[0]).toBeCloseTo(6);
  });

  it("never blends vehicle state across configuration epochs", () => {
    const before = {
      players: [player("one", [100, 0])],
      configurationEpoch: 1,
      mapId: "city-circuit",
    };
    const after = {
      players: [player("one", [0, 0])],
      configurationEpoch: 2,
      mapId: "crosswind",
    };
    expect(interpolateSnapshot(before, after, 0.9)).toEqual(before);
    expect(interpolateSnapshot(before, after, 1)).toEqual(after);
  });

  it("applies joins and departures at authoritative snapshot boundaries", () => {
    const before = { players: [player("one", [0, 0])] };
    const after = { players: [player("two", [2, 0])] };
    expect(interpolateSnapshot(before, after, 0.5).players.map(({ playerId }) => playerId))
      .toEqual(["one"]);
    expect(interpolateSnapshot(before, after, 1).players.map(({ playerId }) => playerId))
      .toEqual(["two"]);
  });

  it("replaces duplicate ticks and bounds retained history", () => {
    const buffer = new DrivingSnapshotBuffer({
      interpolationDelaySeconds: 0,
      maximumSnapshots: 3,
      now: () => 0,
    });
    for (let tick = 0; tick < 5; tick++) buffer.push(tick, { players: [] });
    buffer.push(4, { players: [player("replacement", [0, 0])] });
    expect(buffer.size).toBe(3);
    expect(buffer.sample()?.players[0].playerId).toBe("replacement");
  });
});
