import type { GamePayloadCodec, PayloadDecodeResult } from "../../net/protocol/messages";
import type {
  MovingCirclesEvent,
  MovingCirclesInput,
  MovingCirclesSnapshot,
} from "./simulation";

export const movingCirclesPayloadCodec: GamePayloadCodec<
  MovingCirclesInput,
  MovingCirclesSnapshot,
  MovingCirclesEvent
> = {
  encodeInput(input) {
    return new Map<number, unknown>([[0, input.direction]]);
  },

  decodeInput(value) {
    const body = numericMap(value);
    const direction = body && vec2(body.get(0));
    return direction
      ? valid({ direction })
      : invalid("Moving-circles input requires a finite vec2 direction.");
  },

  encodeSnapshot(snapshot) {
    return new Map<number, unknown>([[
      0,
      snapshot.players.map((player) => new Map<number, unknown>([
        [0, player.playerId],
        [1, player.position],
      ])),
    ]]);
  },

  decodeSnapshot(value) {
    const body = numericMap(value);
    const players = body?.get(0);
    if (!Array.isArray(players)) return invalid("Moving-circles snapshot requires players.");
    const result: MovingCirclesSnapshot = { players: [] };
    const seen = new Set<string>();
    for (const encodedPlayer of players) {
      const player = numericMap(encodedPlayer);
      const playerId = player?.get(0);
      const position = player && vec2(player.get(1));
      if (typeof playerId !== "string" || !playerId || !position || seen.has(playerId)) {
        return invalid("Moving-circles snapshot contains an invalid player.");
      }
      seen.add(playerId);
      result.players.push({ playerId, position });
    }
    return valid(result);
  },

  encodeEvent(event) {
    return new Map<number, unknown>([
      [0, event.type === "joined" ? 0 : 1],
      [1, event.playerId],
    ]);
  },

  decodeEvent(value) {
    const body = numericMap(value);
    const eventType = body?.get(0);
    const playerId = body?.get(1);
    if ((eventType !== 0 && eventType !== 1) || typeof playerId !== "string" || !playerId) {
      return invalid("Moving-circles event is invalid.");
    }
    return valid({ type: eventType === 0 ? "joined" : "left", playerId });
  },
};

function numericMap(value: unknown) {
  return value instanceof Map ? value as Map<number, unknown> : null;
}

function vec2(value: unknown): [number, number] | null {
  if (
    !Array.isArray(value)
    || value.length !== 2
    || value.some((part) => typeof part !== "number" || !Number.isFinite(part))
  ) return null;
  return [value[0] as number, value[1] as number];
}

function valid<Value>(value: Value): PayloadDecodeResult<Value> {
  return { ok: true, value };
}

function invalid(message: string): PayloadDecodeResult<never> {
  return { ok: false, message };
}
