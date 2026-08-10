import type { GamePayloadCodec, PayloadDecodeResult } from "../../../net/protocol/messages";
import { productionDrivingPayloadCodec } from "./protocol";
import type {
  AuthoritativeDrivingEvent,
  AuthoritativeDrivingInput,
  AuthoritativeDrivingSnapshot,
} from "./simulation";

export const CONFIGURABLE_DRIVING_RULESET_ID = Uint8Array.from([
  0x73, 0xa8, 0x1f, 0x2c, 0x44, 0xe9, 0x4b, 0x61,
  0x92, 0x07, 0xbc, 0x55, 0x10, 0xde, 0x8a, 0x03,
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
    });
  },
  encodeEvent(event) {
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

function isUint32(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 4_294_967_295;
}
function boundedSteering(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1;
}
function boundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}
function valid<Value>(value: Value): PayloadDecodeResult<Value> { return { ok: true, value }; }
function invalid(message: string): PayloadDecodeResult<never> { return { ok: false, message }; }
