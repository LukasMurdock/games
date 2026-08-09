import { describe, expect, it } from "vitest";
import { GameNetCodec } from "../../../net/protocol/codec";
import { productionDrivingPayloadCodec } from "./protocol";

const codec = new GameNetCodec(productionDrivingPayloadCodec);

describe("production driving GameNet payload", () => {
  it("round-trips production control intent", () => {
    const message = {
      type: "input" as const,
      sequence: 7,
      input: { steering: -1 as const, throttle: 1, brake: false, handbrake: true },
    };
    expect(codec.decode(codec.encode(message))).toEqual({ ok: true, value: message });
  });

  it("round-trips presentation-complete authoritative snapshots", () => {
    const message = {
      type: "snapshot" as const,
      tick: 42,
      snapshot: {
        players: [{
          playerId: "guest-1",
          position: [1, 2] as [number, number],
          velocity: [3, 4] as [number, number],
          heading: 0.5,
          speed: 5,
          visualSlip: -0.2,
          driftPhase: "sustain" as const,
          boosting: true,
          exitPulse: 0.4,
        }],
      },
    };
    expect(codec.decode(codec.encode(message))).toEqual({ ok: true, value: message });
  });

  it("round-trips vehicle and world collision events", () => {
    for (const event of [
      { type: "collision" as const, playerId: "one", otherPlayerId: "two", terminal: false },
      { type: "collision" as const, playerId: "one", terminal: true },
    ]) {
      const message = { type: "event" as const, tick: 9, event };
      expect(codec.decode(codec.encode(message))).toEqual({ ok: true, value: message });
    }
  });

  it("rejects invalid drift phases and control ranges", () => {
    expect(productionDrivingPayloadCodec.decodeInput(new Map<number, unknown>([
      [0, 2], [1, 1], [2, false], [3, false],
    ])).ok).toBe(false);
    expect(productionDrivingPayloadCodec.decodeSnapshot(new Map<number, unknown>([[
      0,
      [new Map<number, unknown>([
        [0, "driver"], [1, [0, 0]], [2, [0, 0]], [3, 0], [4, 0],
        [5, 0], [6, 99], [7, false], [8, 0],
      ])],
    ]])).ok).toBe(false);
  });
});
