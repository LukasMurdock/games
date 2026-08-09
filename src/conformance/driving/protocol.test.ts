import { describe, expect, it } from "vitest";
import { GameNetCodec } from "../../net/protocol/codec";
import { drivingPayloadCodec } from "./protocol";

const codec = new GameNetCodec(drivingPayloadCodec);

describe("driving GameNet payload", () => {
  it("round-trips control intent", () => {
    const message = {
      type: "input" as const,
      sequence: 4,
      input: { steering: -0.5, throttle: 1, brake: false, handbrake: true },
    };
    expect(codec.decode(codec.encode(message))).toEqual({ ok: true, value: message });
  });

  it("round-trips authoritative snapshots", () => {
    const message = {
      type: "snapshot" as const,
      tick: 12,
      snapshot: {
        players: [{
          playerId: "guest-1",
          position: [1, 2] as [number, number],
          velocity: [3, 4] as [number, number],
          heading: 0.25,
          speed: 5,
        }],
      },
    };
    expect(codec.decode(codec.encode(message))).toEqual({ ok: true, value: message });
  });

  it("rejects out-of-range input and ignores bounded extension fields", () => {
    expect(drivingPayloadCodec.decodeInput(new Map<number, unknown>([
      [0, 2], [1, 1], [2, false], [3, false],
    ])).ok).toBe(false);
    expect(drivingPayloadCodec.decodeInput(new Map<number, unknown>([
      [0, 0], [1, 1], [2, false], [3, false], [4, 0],
    ]))).toEqual({
      ok: true,
      value: { steering: 0, throttle: 1, brake: false, handbrake: false },
    });
  });
});
