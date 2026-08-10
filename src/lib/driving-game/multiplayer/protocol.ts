import type { GamePayloadCodec, PayloadDecodeResult } from "../../../net/protocol/messages";
import type { DriftPhase } from "../types";
import type {
  AuthoritativeDrivingEvent,
  AuthoritativeDrivingInput,
  AuthoritativeDrivingSnapshot,
} from "./simulation";

export const PRODUCTION_DRIVING_GAME_ID = "driving";
export const PRODUCTION_DRIVING_RULESET_ID = Uint8Array.from([
  0x42, 0x2c, 0x7a, 0x11, 0x96, 0x5d, 0x4e, 0x38,
  0xb1, 0xd0, 0x73, 0xf5, 0x29, 0xa4, 0x6c, 0x02,
]);

const DRIFT_PHASES: readonly DriftPhase[] = [
  "grip", "breakaway", "sustain", "transition", "recover",
];

export const productionDrivingPayloadCodec: GamePayloadCodec<
  AuthoritativeDrivingInput,
  AuthoritativeDrivingSnapshot,
  AuthoritativeDrivingEvent
> = {
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
    const steering = body && finiteNumber(body.get(0));
    const throttle = body && finiteNumber(body.get(1));
    const brake = body?.get(2);
    const handbrake = body?.get(3);
    if (
      steering === null || (steering !== -1 && steering !== 0 && steering !== 1)
      || throttle === null || throttle < 0 || throttle > 1
      || typeof brake !== "boolean" || typeof handbrake !== "boolean"
    ) return invalid("Production driving input contains an invalid control value.");
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
        [5, player.visualSlip],
        [6, DRIFT_PHASES.indexOf(player.driftPhase)],
        [7, player.boosting],
        [8, player.exitPulse],
      ])),
    ]]);
  },

  decodeSnapshot(value) {
    const body = requiredNumericMap(value, [0]);
    const encodedPlayers = body?.get(0);
    if (!Array.isArray(encodedPlayers) || encodedPlayers.length > 8) {
      return invalid("Production driving snapshot requires at most eight players.");
    }
    const players: AuthoritativeDrivingSnapshot["players"] = [];
    const seen = new Set<string>();
    for (const encoded of encodedPlayers) {
      const player = requiredNumericMap(encoded, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
      const playerId = player?.get(0);
      const position = player && vec2(player.get(1));
      const velocity = player && vec2(player.get(2));
      const heading = player && finiteNumber(player.get(3));
      const speed = player && finiteNumber(player.get(4));
      const visualSlip = player && finiteNumber(player.get(5));
      const phaseId = player?.get(6);
      const boosting = player?.get(7);
      const exitPulse = player && finiteNumber(player.get(8));
      const driftPhase = Number.isInteger(phaseId) ? DRIFT_PHASES[phaseId as number] : undefined;
      if (
        typeof playerId !== "string" || !playerId || playerId.length > 64 || seen.has(playerId)
        || !position || !velocity || heading === null
        || speed === null || speed < 0
        || visualSlip === null || !driftPhase
        || typeof boosting !== "boolean"
        || exitPulse === null || exitPulse < 0
      ) return invalid("Production driving snapshot contains an invalid player.");
      seen.add(playerId);
      players.push({
        playerId,
        position,
        velocity,
        heading,
        speed,
        visualSlip,
        driftPhase,
        boosting,
        exitPulse,
      });
    }
    return valid({ players });
  },

  encodeEvent(event) {
    if (event.type === "configuration") {
      throw new Error("Configuration events require the configurable driving ruleset.");
    }
    if (event.type !== "collision") {
      return new Map<number, unknown>([
        [0, event.type === "joined" ? 0 : 1],
        [1, event.playerId],
      ]);
    }
    return new Map<number, unknown>([
      [0, 2],
      [1, event.playerId],
      ...(event.otherPlayerId === undefined ? [] : [[2, event.otherPlayerId] as [number, unknown]]),
      [3, event.terminal],
    ]);
  },

  decodeEvent(value) {
    const body = requiredNumericMap(value, [0, 1]);
    const type = body?.get(0);
    const playerId = body?.get(1);
    if ((type !== 0 && type !== 1 && type !== 2) || typeof playerId !== "string" || !playerId) {
      return invalid("Production driving event is invalid.");
    }
    if (type === 0) return valid({ type: "joined", playerId });
    if (type === 1) return valid({ type: "left", playerId });
    const otherPlayerId = body?.get(2);
    const terminal = body?.get(3);
    if (
      (otherPlayerId !== undefined && (typeof otherPlayerId !== "string" || !otherPlayerId))
      || typeof terminal !== "boolean"
    ) return invalid("Production driving collision event is invalid.");
    return valid({
      type: "collision",
      playerId,
      ...(otherPlayerId === undefined ? {} : { otherPlayerId }),
      terminal,
    });
  },
};

function numericMap(value: unknown) {
  if (!(value instanceof Map)) return null;
  if ([...value.keys()].some((key) => !Number.isInteger(key) || key < 0)) return null;
  return value as Map<number, unknown>;
}
function requiredNumericMap(value: unknown, keys: readonly number[]) {
  const map = numericMap(value);
  return map && keys.every((key) => map.has(key)) ? map : null;
}
function vec2(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const x = finiteNumber(value[0]);
  const z = finiteNumber(value[1]);
  return x === null || z === null ? null : [x, z];
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
