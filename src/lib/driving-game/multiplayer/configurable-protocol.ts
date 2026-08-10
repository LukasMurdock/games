import type { GamePayloadCodec, PayloadDecodeResult } from "../../../net/protocol/messages";
import { productionDrivingPayloadCodec } from "./protocol";
import type {
  AuthoritativeDrivingEvent,
  AuthoritativeDrivingInput,
  AuthoritativeDrivingSnapshot,
} from "./simulation";

export const CONFIGURABLE_DRIVING_RULESET_ID = Uint8Array.from([
  0xec, 0xb6, 0x46, 0x29, 0xe7, 0x9f, 0x02, 0x3b,
  0x28, 0x0b, 0xb0, 0x18, 0x6e, 0x8d, 0xc3, 0xb1,
]);

export const configurableDrivingPayloadCodec: GamePayloadCodec<
  AuthoritativeDrivingInput,
  AuthoritativeDrivingSnapshot,
  AuthoritativeDrivingEvent
> = {
  encodeInput(input) {
    const encoded = productionDrivingPayloadCodec.encodeInput(input) as Map<number, unknown>;
    if (input.readyEpoch !== undefined) encoded.set(4, input.readyEpoch);
    return encoded;
  },
  decodeInput(value) {
    const decoded = productionDrivingPayloadCodec.decodeInput(value);
    if (!decoded.ok) return decoded;
    const map = value instanceof Map ? value as Map<number, unknown> : null;
    const readyEpoch = map?.get(4);
    if (readyEpoch !== undefined && !isUint32(readyEpoch)) {
      return invalid("Configuration readiness epoch must be a uint32.");
    }
    return valid({ ...decoded.value, ...(readyEpoch === undefined ? {} : { readyEpoch }) });
  },
  encodeSnapshot(snapshot) {
    const encoded = productionDrivingPayloadCodec.encodeSnapshot(snapshot) as Map<number, unknown>;
    const players = encoded.get(0) as Map<number, unknown>[];
    players.forEach((player, index) => player.set(9, snapshot.players[index].steering ?? 0));
    encoded.set(1, snapshot.configurationEpoch);
    encoded.set(2, snapshot.paused);
    encoded.set(3, snapshot.mapId);
    encoded.set(4, snapshot.modeId);
    encoded.set(5, snapshot.profileId);
    encoded.set(6, snapshot.controlMode === "automatic" ? 0 : 1);
    if (snapshot.pursuers) encoded.set(7, snapshot.pursuers.map((pursuer) => new Map<number, unknown>([
      [0, pursuer.pursuerId],
      [1, pursuer.targetPlayerId],
      [2, pursuer.position],
      [3, pursuer.heading],
      [4, pursuer.speed],
      [5, pursuer.steering],
    ])));
    if (snapshot.chase) encoded.set(8, new Map<number, unknown>([
      [0, snapshot.chase.state === "active" ? 0 : 1],
      [1, snapshot.chase.survivalTime],
      [2, snapshot.chase.nearestDistance],
      [3, snapshot.chase.reinforcements],
      ...(snapshot.chase.capturedPlayerId === undefined ? [] : [[4, snapshot.chase.capturedPlayerId] as [number, unknown]]),
    ]));
    return encoded;
  },
  decodeSnapshot(value) {
    const decoded = productionDrivingPayloadCodec.decodeSnapshot(value);
    if (!decoded.ok) return decoded;
    const map = value instanceof Map ? value as Map<number, unknown> : null;
    const configurationEpoch = map?.get(1);
    const paused = map?.get(2);
    const mapId = map?.get(3);
    const modeId = map?.get(4);
    const profileId = map?.get(5);
    const controlModeId = map?.get(6);
    const encodedPlayers = map?.get(0);
    const pursuers = decodePursuers(map?.get(7));
    const chase = decodeChase(map?.get(8));
    const steering = Array.isArray(encodedPlayers)
      ? encodedPlayers.map((player) => player instanceof Map ? player.get(9) : undefined)
      : [];
    if (
      !isUint32(configurationEpoch)
      || typeof paused !== "boolean"
      || !boundedId(mapId)
      || !boundedId(modeId)
      || !boundedId(profileId)
      || (controlModeId !== 0 && controlModeId !== 1)
      || steering.length !== decoded.value.players.length
      || steering.some((value) => !boundedSteering(value))
      || pursuers === null
      || chase === null
      || (modeId === "chase" && (!pursuers || !chase))
    ) return invalid("Configurable driving snapshot has invalid session configuration.");
    return valid({
      ...decoded.value,
      players: decoded.value.players.map((player, index) => ({ ...player, steering: steering[index] })),
      configurationEpoch,
      paused,
      mapId,
      modeId,
      profileId,
      controlMode: controlModeId === 0 ? "automatic" : "manual",
      ...(pursuers ? { pursuers } : {}),
      ...(chase ? { chase } : {}),
    });
  },
  encodeEvent(event) {
    if (event.type === "chase-captured") return new Map<number, unknown>([
      [0, 4],
      [1, event.playerId],
      [2, event.survivalTime],
    ]);
    if (event.type !== "configuration") return productionDrivingPayloadCodec.encodeEvent(event);
    return new Map<number, unknown>([
      [0, 3],
      [1, event.configurationEpoch],
      [2, event.mapId],
      [3, event.modeId],
      [4, event.profileId],
      [5, event.controlMode === "automatic" ? 0 : 1],
    ]);
  },
  decodeEvent(value) {
    const map = value instanceof Map ? value as Map<number, unknown> : null;
    if (map?.get(0) === 4) {
      const playerId = map.get(1);
      const survivalTime = map.get(2);
      if (!boundedId(playerId) || !finiteNonNegative(survivalTime)) return invalid("Chase capture event is invalid.");
      return valid({ type: "chase-captured", playerId, survivalTime });
    }
    if (map?.get(0) !== 3) return productionDrivingPayloadCodec.decodeEvent(value);
    const configurationEpoch = map.get(1);
    const mapId = map.get(2);
    const modeId = map.get(3);
    const profileId = map.get(4);
    const controlModeId = map.get(5);
    if (
      !isUint32(configurationEpoch)
      || !boundedId(mapId)
      || !boundedId(modeId)
      || !boundedId(profileId)
      || (controlModeId !== 0 && controlModeId !== 1)
    ) return invalid("Configuration event is invalid.");
    return valid({
      type: "configuration",
      configurationEpoch,
      mapId,
      modeId,
      profileId,
      controlMode: controlModeId === 0 ? "automatic" : "manual",
    });
  },
};

function decodePursuers(value: unknown): AuthoritativeDrivingSnapshot["pursuers"] | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 6) return null;
  const pursuers: NonNullable<AuthoritativeDrivingSnapshot["pursuers"]> = [];
  for (const encoded of value) {
    if (!(encoded instanceof Map)) return null;
    const pursuerId = encoded.get(0);
    const targetPlayerId = encoded.get(1);
    const position = encoded.get(2);
    const heading = encoded.get(3);
    const speed = encoded.get(4);
    const steering = encoded.get(5);
    if (
      !boundedId(pursuerId)
      || !boundedId(targetPlayerId)
      || !vec2(position)
      || !finite(heading)
      || !finiteNonNegative(speed)
      || !boundedSteering(steering)
    ) return null;
    pursuers.push({ pursuerId, targetPlayerId, position, heading, speed, steering });
  }
  return pursuers;
}

function decodeChase(value: unknown): AuthoritativeDrivingSnapshot["chase"] | null {
  if (value === undefined) return undefined;
  if (!(value instanceof Map)) return null;
  const state = value.get(0);
  const survivalTime = value.get(1);
  const nearestDistance = value.get(2);
  const reinforcements = value.get(3);
  const capturedPlayerId = value.get(4);
  if (
    (state !== 0 && state !== 1)
    || !finiteNonNegative(survivalTime)
    || !finiteNonNegative(nearestDistance)
    || typeof reinforcements !== "boolean"
    || (capturedPlayerId !== undefined && !boundedId(capturedPlayerId))
  ) return null;
  return {
    state: state === 0 ? "active" : "captured",
    survivalTime,
    nearestDistance,
    reinforcements,
    ...(capturedPlayerId === undefined ? {} : { capturedPlayerId }),
  };
}

function isUint32(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 4_294_967_295;
}
function boundedSteering(value: unknown): value is number {
  return finite(value) && value >= -1 && value <= 1;
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function finiteNonNegative(value: unknown): value is number { return finite(value) && value >= 0; }
function vec2(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(finite);
}
function boundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}
function valid<Value>(value: Value): PayloadDecodeResult<Value> { return { ok: true, value }; }
function invalid(message: string): PayloadDecodeResult<never> { return { ok: false, message }; }
