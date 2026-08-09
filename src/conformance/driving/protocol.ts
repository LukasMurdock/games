import type { GamePayloadCodec, PayloadDecodeResult } from "../../net/protocol/messages";
import type { DrivingEvent, DrivingInput, DrivingSnapshot } from "./simulation";

export const DRIVING_GAME_ID = "driving";
export const DRIVING_RULESET_ID = Uint8Array.from([
  0x9d, 0xf5, 0xa1, 0x70, 0x28, 0x6c, 0x45, 0x9b,
  0x8f, 0x20, 0xd7, 0x33, 0x67, 0x8b, 0x1e, 0x01,
]);

export const drivingPayloadCodec: GamePayloadCodec<DrivingInput, DrivingSnapshot, DrivingEvent> = {
  encodeInput(input) {
    return new Map<number, unknown>([
      [0, input.steering],
      [1, input.throttle],
      [2, input.brake],
      [3, input.handbrake],
    ]);
  },

  decodeInput(value) {
    const body = requiredNumericMap(value, [0, 1, 2, 3]);
    if (!body) return invalid("Driving input requires fields 0 through 3.");
    const steering = finiteNumber(body.get(0));
    const throttle = finiteNumber(body.get(1));
    const brake = body.get(2);
    const handbrake = body.get(3);
    if (
      steering === null || steering < -1 || steering > 1
      || throttle === null || throttle < 0 || throttle > 1
      || typeof brake !== "boolean"
      || typeof handbrake !== "boolean"
    ) return invalid("Driving input contains an invalid control value.");
    return valid({ steering, throttle, brake, handbrake });
  },

  encodeSnapshot(snapshot) {
    return new Map<number, unknown>([[
      0,
      snapshot.players.map((player) => new Map<number, unknown>([
        [0, player.playerId],
        [1, player.position],
        [2, player.velocity],
        [3, player.heading],
        [4, player.speed],
      ])),
    ]]);
  },

  decodeSnapshot(value) {
    const body = requiredNumericMap(value, [0]);
    const encodedPlayers = body?.get(0);
    if (!Array.isArray(encodedPlayers) || encodedPlayers.length > 8) {
      return invalid("Driving snapshot requires at most eight players.");
    }
    const players: DrivingSnapshot["players"] = [];
    const seen = new Set<string>();
    for (const encoded of encodedPlayers) {
      const player = requiredNumericMap(encoded, [0, 1, 2, 3, 4]);
      const playerId = player?.get(0);
      const position = player && vec2(player.get(1));
      const velocity = player && vec2(player.get(2));
      const heading = player && finiteNumber(player.get(3));
      const speed = player && finiteNumber(player.get(4));
      if (
        typeof playerId !== "string" || playerId.length === 0 || playerId.length > 64
        || seen.has(playerId) || !position || !velocity || heading === null
        || speed === null || speed < 0
      ) return invalid("Driving snapshot contains an invalid player.");
      seen.add(playerId);
      players.push({ playerId, position, velocity, heading, speed });
    }
    return valid({ players });
  },

  encodeEvent(event) {
    const type = event.type === "joined" ? 0 : event.type === "left" ? 1 : 2;
    return new Map<number, unknown>([
      [0, type],
      [1, event.playerId],
      ...(event.type === "collision" && event.otherPlayerId !== undefined
        ? [[2, event.otherPlayerId] as [number, unknown]]
        : []),
    ]);
  },

  decodeEvent(value) {
    const body = numericMap(value);
    if (!body) return invalid("Driving event requires an integer-keyed record.");
    const type = body.get(0);
    const playerId = body.get(1);
    const otherPlayerId = body.get(2);
    if (
      (type !== 0 && type !== 1 && type !== 2)
      || typeof playerId !== "string" || !playerId
      || (otherPlayerId !== undefined && (typeof otherPlayerId !== "string" || !otherPlayerId))
      || (type !== 2 && otherPlayerId !== undefined)
    ) return invalid("Driving event is invalid.");
    if (type === 0) return valid({ type: "joined", playerId });
    if (type === 1) return valid({ type: "left", playerId });
    return valid({ type: "collision", playerId, ...(otherPlayerId === undefined ? {} : { otherPlayerId }) });
  },
};

function numericMap(value: unknown) {
  if (!(value instanceof Map)) return null;
  if ([...value.keys()].some((key) => !Number.isInteger(key) || key < 0)) return null;
  return value as Map<number, unknown>;
}

function requiredNumericMap(value: unknown, keys: readonly number[]) {
  const map = numericMap(value);
  if (!map || keys.some((key) => !map.has(key))) return null;
  return map;
}

function vec2(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const x = finiteNumber(value[0]);
  const y = finiteNumber(value[1]);
  return x === null || y === null ? null : [x, y];
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function valid<Value>(value: Value): PayloadDecodeResult<Value> {
  return { ok: true, value };
}

function invalid(message: string): PayloadDecodeResult<never> {
  return { ok: false, message };
}
