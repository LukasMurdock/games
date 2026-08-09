import { encode as encodeCbor } from "cbor2";
import { describe, expect, it } from "vitest";
import { GameNetCodec } from "./codec";
import type { GamePayloadCodec, PayloadDecodeResult } from "./messages";

type CircleInput = { direction: [number, number] };
type CircleSnapshot = { players: Array<{ playerId: string; position: [number, number] }> };
type CircleEvent = { eventType: number; playerId?: string };

const payloads: GamePayloadCodec<CircleInput, CircleSnapshot, CircleEvent> = {
  encodeInput: (input) => new Map<number, unknown>([[0, input.direction]]),
  decodeInput(value) {
    const body = numericMap(value);
    if (!body) return invalid("Circle input must be a map.");
    const direction = vec2(body.get(0));
    return direction ? valid({ direction }) : invalid("Circle direction must be vec2.");
  },
  encodeSnapshot: (snapshot) => new Map<number, unknown>([
    [0, snapshot.players.map((player) => new Map<number, unknown>([
      [0, player.playerId],
      [1, player.position],
    ]))],
  ]),
  decodeSnapshot(value) {
    const body = numericMap(value);
    const players = body?.get(0);
    if (!Array.isArray(players)) return invalid("Circle players must be an array.");
    const decoded: CircleSnapshot["players"] = [];
    for (const player of players) {
      const playerBody = numericMap(player);
      const playerId = playerBody?.get(0);
      const position = vec2(playerBody?.get(1));
      if (typeof playerId !== "string" || !position) return invalid("Invalid circle player.");
      decoded.push({ playerId, position });
    }
    return valid({ players: decoded });
  },
  encodeEvent: (event) => new Map<number, unknown>([
    [0, event.eventType],
    ...(event.playerId === undefined ? [] : [[1, event.playerId] as [number, unknown]]),
  ]),
  decodeEvent(value) {
    const body = numericMap(value);
    const eventType = body?.get(0);
    const playerId = body?.get(1);
    if (!Number.isInteger(eventType) || (playerId !== undefined && typeof playerId !== "string")) {
      return invalid("Invalid circle event.");
    }
    return valid({ eventType: eventType as number, ...(playerId === undefined ? {} : { playerId }) });
  },
};

const codec = new GameNetCodec(payloads);
const rulesetId = hex("00112233445566778899aabbccddeeff");

describe("GameNetCodec", () => {
  it("round-trips typed core and game messages", () => {
    const messages = [
      {
        type: "hello" as const,
        supportedProtocolMajors: [1],
        gameId: "moving-circles",
        rulesetId,
        features: [32],
      },
      {
        type: "welcome" as const,
        protocolMajor: 1 as const,
        playerId: "player-2",
        gameId: "moving-circles",
        rulesetId,
        features: [32],
      },
      { type: "input" as const, sequence: 938, input: { direction: [0.82, -0.2] as [number, number] } },
      {
        type: "snapshot" as const,
        tick: 4217,
        snapshot: { players: [{ playerId: "player-2", position: [9.25, 14.5] as [number, number] }] },
      },
      { type: "event" as const, tick: 4217, event: { eventType: 0, playerId: "player-2" } },
      { type: "ping" as const, requestId: 7 },
      { type: "pong" as const, requestId: 7 },
      { type: "disconnect" as const, code: 0, diagnostic: "bye" },
      { type: "error" as const, code: 3, diagnostic: "bad packet" },
    ];

    for (const message of messages) {
      const decoded = codec.decode(codec.encode(message));
      expect(decoded).toEqual({ ok: true, value: message });
    }
  });

  it("decodes the independently generated diagnostic fixtures", () => {
    const hello = codec.decode(hex(
      "8200a4008101016e6d6f76696e672d636972636c6573025000112233445566778899aabbccddeeff0380",
    ));
    const input = codec.decodeForChannel(hex(
      "8202a2001903aa01a10082fb3fea3d70a3d70a3dfbbfc999999999999a",
    ), "realtime");

    expect(hello).toEqual({
      ok: true,
      value: {
        type: "hello",
        supportedProtocolMajors: [1],
        gameId: "moving-circles",
        rulesetId,
        features: [],
      },
    });
    expect(input).toEqual({
      ok: true,
      value: { type: "input", sequence: 938, input: { direction: [0.82, -0.2] } },
    });
  });

  it("ignores bounded unknown optional fields", () => {
    const bytes = encodeCbor([0, new Map<number, unknown>([
      [0, [1]],
      [1, "moving-circles"],
      [2, rulesetId],
      [99, new Map([[12, [true, null]]])],
    ])]);

    const decoded = codec.decode(bytes);

    expect(decoded.ok && decoded.value).toEqual({
      type: "hello",
      supportedProtocolMajors: [1],
      gameId: "moving-circles",
      rulesetId,
      features: [],
    });
  });

  it.each([
    ["trailing data", new Uint8Array([0x00, 0x00])],
    ["duplicate map keys", hex("8205a200010002")],
    ["indefinite values", hex("9f00ff")],
    ["CBOR tags", hex("c000")],
    ["NaN", hex("f97e00")],
    ["truncated input", hex("8218")],
  ])("returns an error rather than throwing for %s", (_name, bytes) => {
    expect(() => codec.decode(bytes)).not.toThrow();
    expect(codec.decode(bytes).ok).toBe(false);
  });

  it("rejects oversized packets before CBOR decoding", () => {
    const bytes = new Uint8Array(16 * 1024 + 1);
    const decoded = codec.decodeForChannel(bytes, "realtime");

    expect(decoded).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "packet-too-large" }),
    });
  });

  it("enforces registered channel placement", () => {
    const input = codec.encode({
      type: "input",
      sequence: 1,
      input: { direction: [1, 0] },
    });
    const hello = codec.encode({
      type: "hello",
      supportedProtocolMajors: [1],
      gameId: "moving-circles",
      rulesetId,
      features: [],
    });

    expect(codec.decodeForChannel(input, "reliable")).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "channel-mismatch" }),
    });
    expect(codec.decodeForChannel(hello, "realtime")).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "channel-mismatch" }),
    });
  });

  it("enforces array, map, text, and depth limits", () => {
    const largeMap = new Map<number, unknown>();
    for (let index = 0; index < 257; index++) largeMap.set(index, 0);
    let deeplyNested: unknown = 0;
    for (let index = 0; index < 14; index++) deeplyNested = [deeplyNested];
    const fixtures = [
      [4, new Map<number, unknown>([
        [0, 1],
        [1, new Map<number, unknown>([[0, new Array(1025).fill(0)]])],
      ])],
      [4, new Map<number, unknown>([[0, 1], [1, largeMap]])],
      [4, new Map<number, unknown>([[0, 1], [1, new Map([[0, "x".repeat(257)]])]])],
      deeplyNested,
    ];

    for (const fixture of fixtures) {
      expect(codec.decode(encodeCbor(fixture))).toEqual({
        ok: false,
        error: expect.objectContaining({ code: "limit-exceeded" }),
      });
    }
  });

  it("enforces negotiation list limits", () => {
    const tooManyMajors = encodeCbor([0, new Map<number, unknown>([
      [0, [1, 2, 3, 4, 5, 6, 7, 8, 9]],
      [1, "moving-circles"],
      [2, rulesetId],
    ])]);
    const tooManyFeatures = encodeCbor([0, new Map<number, unknown>([
      [0, [1]],
      [1, "moving-circles"],
      [2, rulesetId],
      [3, Array.from({ length: 65 }, (_, index) => index)],
    ])]);

    expect(codec.decode(tooManyMajors)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid-message" }),
    });
    expect(codec.decode(tooManyFeatures)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid-message" }),
    });
  });

  it("rejects reserved and unnegotiated message types", () => {
    const reserved = codec.decode(encodeCbor([9, new Map()]));
    const gameSpecific = codec.decode(encodeCbor([32, new Map()]));

    expect(reserved).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "unsupported-message" }),
    });
    expect(gameSpecific).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "unsupported-message" }),
    });
  });

  it("rejects invalid envelopes and game payloads", () => {
    const envelope = codec.decode(encodeCbor([2]));
    const payload = codec.decode(encodeCbor([
      2,
      new Map<number, unknown>([[0, 1], [1, new Map<number, unknown>()]]),
    ]));

    expect(envelope).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid-envelope" }),
    });
    expect(payload).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid-message" }),
    });
  });

  it("rejects invalid typed values before encoding", () => {
    expect(() => codec.encode({
      type: "hello",
      supportedProtocolMajors: [1, 1],
      gameId: "moving-circles",
      rulesetId,
      features: [],
    })).toThrow("duplicates");
    expect(() => codec.encode({
      type: "input",
      sequence: 1,
      input: { direction: [Number.NaN, 0] },
    })).toThrow("NaN");
  });
});

function numericMap(value: unknown) {
  return value instanceof Map ? value as Map<number, unknown> : null;
}

function vec2(value: unknown): [number, number] | null {
  return Array.isArray(value)
    && value.length === 2
    && value.every((part) => typeof part === "number" && Number.isFinite(part))
    ? [value[0] as number, value[1] as number]
    : null;
}

function valid<Value>(value: Value): PayloadDecodeResult<Value> {
  return { ok: true, value };
}

function invalid(message: string): PayloadDecodeResult<never> {
  return { ok: false, message };
}

function hex(value: string) {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}
