import { describe, expect, it } from "vitest";
import { GameNetCodec } from "../../../net/protocol/codec";
import { configurableDrivingPayloadCodec } from "./configurable-protocol";

const codec = new GameNetCodec(configurableDrivingPayloadCodec);

describe("configurable production driving payload", () => {
  it("round-trips readiness intent", () => {
    const message = {
      type: "input" as const,
      sequence: 2,
      input: {
        steering: 0 as const,
        throttle: 0,
        brake: false,
        handbrake: false,
        readyEpoch: 7,
      },
    };
    expect(codec.decode(codec.encode(message))).toEqual({ ok: true, value: message });
  });

  it("round-trips authoritative configuration state", () => {
    const message = {
      type: "snapshot" as const,
      tick: 10,
      snapshot: {
        players: [],
        configurationEpoch: 3,
        paused: true,
        mapId: "crosswind",
        modeId: "cruise",
        profileId: "loose",
        controlMode: "automatic" as const,
      },
    };
    expect(codec.decode(codec.encode(message))).toEqual({ ok: true, value: message });
  });

  it("round-trips authoritative wheel steering", () => {
    const message = {
      type: "snapshot" as const,
      tick: 10,
      snapshot: {
        players: [{
          playerId: "driver",
          position: [0, 0] as [number, number],
          velocity: [0, 0] as [number, number],
          heading: 0,
          speed: 0,
          visualSlip: 0,
          driftPhase: "grip" as const,
          boosting: false,
          exitPulse: 0,
          steering: -1,
        }],
        configurationEpoch: 3,
        paused: false,
        mapId: "city-circuit",
        modeId: "cruise",
        profileId: "loose",
        controlMode: "automatic" as const,
      },
    };
    expect(codec.decode(codec.encode(message))).toEqual({ ok: true, value: message });
  });

  it("round-trips authoritative Chase state and capture events", () => {
    const snapshotMessage = {
      type: "snapshot" as const,
      tick: 12,
      snapshot: {
        players: [],
        pursuers: [{
          pursuerId: "police-0",
          targetPlayerId: "host",
          position: [1, 2] as [number, number],
          heading: 0.2,
          speed: 18,
          steering: -0.1,
        }],
        chase: {
          state: "active" as const,
          survivalTime: 14.5,
          nearestDistance: 9,
          reinforcements: true,
        },
        configurationEpoch: 3,
        paused: false,
        mapId: "city-circuit",
        modeId: "chase",
        profileId: "aggressive",
        controlMode: "automatic" as const,
      },
    };
    expect(codec.decode(codec.encode(snapshotMessage))).toEqual({ ok: true, value: snapshotMessage });

    const eventMessage = {
      type: "event" as const,
      tick: 13,
      event: { type: "chase-captured" as const, playerId: "host", survivalTime: 14.5 },
    };
    expect(codec.decode(codec.encode(eventMessage))).toEqual({ ok: true, value: eventMessage });
  });

  it("round-trips reliable configuration events", () => {
    const message = {
      type: "event" as const,
      tick: 11,
      event: {
        type: "configuration" as const,
        configurationEpoch: 4,
        mapId: "crosswind",
        modeId: "cruise",
        profileId: "loose",
        controlMode: "automatic" as const,
      },
    };
    expect(codec.decode(codec.encode(message))).toEqual({ ok: true, value: message });
  });

  it("requires complete configuration metadata", () => {
    expect(configurableDrivingPayloadCodec.decodeSnapshot(new Map<number, unknown>([
      [0, []], [1, 1], [2, true],
    ])).ok).toBe(false);
  });
});
