import { decode as decodeCbor, encode as encodeCbor } from "cbor2";
import { GAMENET_LIMITS, type GameNetChannel } from "./limits";
import {
  GAME_NET_PROTOCOL_MAJOR,
  MessageType,
  type DisconnectMessage,
  type EventMessage,
  type GameNetMessage,
  type GamePayloadCodec,
  type HelloMessage,
  type InputMessage,
  type PingMessage,
  type PongMessage,
  type ProtocolErrorMessage,
  type SnapshotMessage,
  type WelcomeMessage,
} from "./messages";

export type DecodeErrorCode =
  | "packet-too-large"
  | "malformed-cbor"
  | "limit-exceeded"
  | "invalid-envelope"
  | "invalid-message"
  | "unsupported-message"
  | "channel-mismatch";

export type DecodeResult<Message> =
  | { ok: true; value: Message }
  | { ok: false; error: { code: DecodeErrorCode; message: string } };

export interface ProtocolCodec<Message> {
  encode(message: Message): Uint8Array;
  decode(bytes: Uint8Array): DecodeResult<Message>;
}

const decoderOptions = {
  maxDepth: GAMENET_LIMITS.maximumDepth,
  rejectStreaming: true,
  rejectDuplicateKeys: true,
  rejectUndefined: true,
  rejectSimple: true,
  preferMap: true,
  ignoreGlobalTags: true,
} as const;

const encoderOptions = {
  rejectUndefined: true,
  rejectCustomSimples: true,
  rejectDuplicateKeys: true,
} as const;

const textEncoder = new TextEncoder();
const UINT16_MAX = 65_535;
const UINT32_MAX = 4_294_967_295;

export class GameNetCodec<Input, Snapshot, Event>
implements ProtocolCodec<GameNetMessage<Input, Snapshot, Event>> {
  constructor(private readonly payloads: GamePayloadCodec<Input, Snapshot, Event>) {}

  encode(message: GameNetMessage<Input, Snapshot, Event>): Uint8Array {
    const wireValue = this.toWire(message);
    const limitError = validateCborValue(wireValue);
    if (limitError) throw new Error(`Cannot encode GameNet message: ${limitError}`);
    return encodeCbor(wireValue, encoderOptions);
  }

  decode(bytes: Uint8Array): DecodeResult<GameNetMessage<Input, Snapshot, Event>> {
    return this.decodeBytes(bytes, GAMENET_LIMITS.reliablePacketBytes, "Packet");
  }

  decodeForChannel(
    bytes: Uint8Array,
    channel: GameNetChannel,
  ): DecodeResult<GameNetMessage<Input, Snapshot, Event>> {
    const maximumBytes = channel === "reliable"
      ? GAMENET_LIMITS.reliablePacketBytes
      : GAMENET_LIMITS.realtimePacketBytes;
    const decoded = this.decodeBytes(bytes, maximumBytes, `${channel} packet`);
    if (decoded.ok && expectedChannel(decoded.value.type) !== channel) {
      return failure(
        "channel-mismatch",
        `${decoded.value.type} messages require the ${expectedChannel(decoded.value.type)} channel.`,
      );
    }
    return decoded;
  }

  private decodeBytes(
    bytes: Uint8Array,
    maximumBytes: number,
    packetName: string,
  ): DecodeResult<GameNetMessage<Input, Snapshot, Event>> {
    if (bytes.byteLength > maximumBytes) {
      return failure("packet-too-large", `${packetName} exceeds ${maximumBytes} bytes.`);
    }

    let wireValue: unknown;
    try {
      wireValue = decodeCbor<unknown>(bytes, decoderOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : "CBOR decoding failed.";
      const code = /depth|size|length/i.test(message) ? "limit-exceeded" : "malformed-cbor";
      return failure(code, message);
    }

    const limitError = validateCborValue(wireValue);
    if (limitError) return failure("limit-exceeded", limitError);
    if (!Array.isArray(wireValue) || wireValue.length !== 2) {
      return failure("invalid-envelope", "A GameNet message must be a two-item array.");
    }
    const [messageType, body] = wireValue;
    if (!isUnsignedInteger(messageType, UINT16_MAX)) {
      return failure("invalid-envelope", "Message type must be an unsigned 16-bit integer.");
    }
    if (!(body instanceof Map)) {
      return failure("invalid-envelope", "Message body must be a map.");
    }

    try {
      return this.fromWire(messageType, body);
    } catch (error) {
      return failure(
        "invalid-message",
        error instanceof Error ? error.message : "Message validation failed.",
      );
    }
  }

  private toWire(message: GameNetMessage<Input, Snapshot, Event>): unknown {
    switch (message.type) {
      case "hello":
        validateHello(message);
        return [MessageType.Hello, mapOf(
          [0, message.supportedProtocolMajors],
          [1, message.gameId],
          [2, message.rulesetId],
          ...(message.features.length ? [[3, message.features] as const] : []),
        )];
      case "welcome":
        validateWelcome(message);
        return [MessageType.Welcome, mapOf(
          [0, message.protocolMajor],
          [1, message.playerId],
          [2, message.gameId],
          [3, message.rulesetId],
          ...(message.features.length ? [[4, message.features] as const] : []),
        )];
      case "input":
        requireUnsigned(message.sequence, UINT32_MAX, "Input sequence");
        return [MessageType.Input, mapOf([0, message.sequence], [1, this.payloads.encodeInput(message.input)])];
      case "snapshot":
        requireUnsigned(message.tick, UINT32_MAX, "Snapshot tick");
        return [MessageType.Snapshot, mapOf([0, message.tick], [1, this.payloads.encodeSnapshot(message.snapshot)])];
      case "event":
        requireUnsigned(message.tick, UINT32_MAX, "Event tick");
        return [MessageType.Event, mapOf([0, message.tick], [1, this.payloads.encodeEvent(message.event)])];
      case "ping":
        requireUnsigned(message.requestId, UINT32_MAX, "Ping request ID");
        return [MessageType.Ping, mapOf([0, message.requestId])];
      case "pong":
        requireUnsigned(message.requestId, UINT32_MAX, "Pong request ID");
        return [MessageType.Pong, mapOf([0, message.requestId])];
      case "disconnect":
        return [MessageType.Disconnect, terminalBody(message)];
      case "error":
        return [MessageType.Error, terminalBody(message)];
    }
  }

  private fromWire(
    messageType: number,
    body: Map<unknown, unknown>,
  ): DecodeResult<GameNetMessage<Input, Snapshot, Event>> {
    switch (messageType) {
      case MessageType.Hello:
        return success(decodeHello(body));
      case MessageType.Welcome:
        return success(decodeWelcome(body));
      case MessageType.Input:
        return this.decodePayloadMessage("input", body, this.payloads.decodeInput.bind(this.payloads));
      case MessageType.Snapshot:
        return this.decodePayloadMessage("snapshot", body, this.payloads.decodeSnapshot.bind(this.payloads));
      case MessageType.Event:
        return this.decodePayloadMessage("event", body, this.payloads.decodeEvent.bind(this.payloads));
      case MessageType.Ping:
        return success<PingMessage>({ type: "ping", requestId: requiredUint(body, 0, UINT32_MAX, "request ID") });
      case MessageType.Pong:
        return success<PongMessage>({ type: "pong", requestId: requiredUint(body, 0, UINT32_MAX, "request ID") });
      case MessageType.Disconnect:
        return success<DisconnectMessage>(decodeTerminal("disconnect", body));
      case MessageType.Error:
        return success<ProtocolErrorMessage>(decodeTerminal("error", body));
      default:
        return failure(
          "unsupported-message",
          messageType <= 31
            ? `Reserved core message type ${messageType}.`
            : `Unnegotiated game-specific message type ${messageType}.`,
        );
    }
  }

  private decodePayloadMessage(
    type: "input" | "snapshot" | "event",
    body: Map<unknown, unknown>,
    decodePayload: (value: unknown) => { ok: true; value: Input | Snapshot | Event } | { ok: false; message: string },
  ): DecodeResult<GameNetMessage<Input, Snapshot, Event>> {
    const counter = requiredUint(body, 0, UINT32_MAX, type === "input" ? "sequence" : "tick");
    const decoded = decodePayload(required(body, 1, `${type} payload`));
    if (!decoded.ok) return failure("invalid-message", decoded.message);
    if (type === "input") {
      return success<InputMessage<Input>>({ type, sequence: counter, input: decoded.value as Input });
    }
    if (type === "snapshot") {
      return success<SnapshotMessage<Snapshot>>({ type, tick: counter, snapshot: decoded.value as Snapshot });
    }
    return success<EventMessage<Event>>({ type, tick: counter, event: decoded.value as Event });
  }
}

function decodeHello(body: Map<unknown, unknown>): HelloMessage {
  const supportedProtocolMajors = numberList(
    required(body, 0, "supported protocol majors"),
    GAMENET_LIMITS.maximumProtocolMajors,
    UINT16_MAX,
    "supported protocol majors",
    true,
  );
  const message: HelloMessage = {
    type: "hello",
    supportedProtocolMajors,
    gameId: requiredText(body, 1, 1, 64, "game ID"),
    rulesetId: requiredBytes(body, 2, 16, 64, "ruleset ID"),
    features: optionalNumberList(body, 3, GAMENET_LIMITS.maximumFeatures, "features"),
  };
  validateHello(message);
  return message;
}

function decodeWelcome(body: Map<unknown, unknown>): WelcomeMessage {
  const protocolMajor = requiredUint(body, 0, UINT16_MAX, "protocol major");
  if (protocolMajor !== GAME_NET_PROTOCOL_MAJOR) throw new Error(`Unsupported selected protocol major ${protocolMajor}.`);
  const message: WelcomeMessage = {
    type: "welcome",
    protocolMajor,
    playerId: requiredText(body, 1, 1, 64, "player ID"),
    gameId: requiredText(body, 2, 1, 64, "game ID"),
    rulesetId: requiredBytes(body, 3, 16, 64, "ruleset ID"),
    features: optionalNumberList(body, 4, GAMENET_LIMITS.maximumFeatures, "features"),
  };
  validateWelcome(message);
  return message;
}

function validateHello(message: HelloMessage) {
  validateNumberList(
    message.supportedProtocolMajors,
    GAMENET_LIMITS.maximumProtocolMajors,
    UINT16_MAX,
    "Supported protocol majors",
    true,
  );
  requireText(message.gameId, 1, 64, "Game ID");
  requireBytes(message.rulesetId, 16, 64, "Ruleset ID");
  validateNumberList(message.features, GAMENET_LIMITS.maximumFeatures, UINT16_MAX, "Features");
}

function validateWelcome(message: WelcomeMessage) {
  if (message.protocolMajor !== GAME_NET_PROTOCOL_MAJOR) throw new Error("Welcome must select protocol major 1.");
  requireText(message.playerId, 1, 64, "Player ID");
  requireText(message.gameId, 1, 64, "Game ID");
  requireBytes(message.rulesetId, 16, 64, "Ruleset ID");
  validateNumberList(message.features, GAMENET_LIMITS.maximumFeatures, UINT16_MAX, "Features");
}

function terminalBody(message: DisconnectMessage | ProtocolErrorMessage) {
  requireUnsigned(message.code, UINT16_MAX, "Terminal code");
  if (message.diagnostic !== undefined) requireText(message.diagnostic, 1, 256, "Diagnostic");
  return mapOf(
    [0, message.code],
    ...(message.diagnostic === undefined ? [] : [[1, message.diagnostic] as const]),
  );
}

function decodeTerminal<Type extends "disconnect" | "error">(
  type: Type,
  body: Map<unknown, unknown>,
): Type extends "disconnect" ? DisconnectMessage : ProtocolErrorMessage {
  const code = requiredUint(body, 0, UINT16_MAX, "terminal code");
  const diagnostic = body.has(1) ? requiredText(body, 1, 1, 256, "diagnostic") : undefined;
  return { type, code, ...(diagnostic === undefined ? {} : { diagnostic }) } as Type extends "disconnect"
    ? DisconnectMessage
    : ProtocolErrorMessage;
}

function validateCborValue(value: unknown, depth = 0): string | null {
  if (depth > GAMENET_LIMITS.maximumDepth) return `Maximum nesting depth ${GAMENET_LIMITS.maximumDepth} exceeded.`;
  if (value === null || typeof value === "boolean") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "NaN and infinity are not allowed.";
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) return "Unsafe integers are not allowed.";
    return null;
  }
  if (typeof value === "string") {
    return textEncoder.encode(value).byteLength <= GAMENET_LIMITS.maximumTextBytes
      ? null
      : `Text exceeds ${GAMENET_LIMITS.maximumTextBytes} UTF-8 bytes.`;
  }
  if (value instanceof Uint8Array) {
    return value.byteLength <= GAMENET_LIMITS.maximumByteStringBytes
      ? null
      : `Byte string exceeds ${GAMENET_LIMITS.maximumByteStringBytes} bytes.`;
  }
  if (Array.isArray(value)) {
    if (value.length > GAMENET_LIMITS.maximumArrayItems) {
      return `Array exceeds ${GAMENET_LIMITS.maximumArrayItems} items.`;
    }
    for (const item of value) {
      const error = validateCborValue(item, depth + 1);
      if (error) return error;
    }
    return null;
  }
  if (value instanceof Map) {
    if (value.size > GAMENET_LIMITS.maximumMapEntries) {
      return `Map exceeds ${GAMENET_LIMITS.maximumMapEntries} entries.`;
    }
    for (const [key, item] of value) {
      if (!isUnsignedInteger(key, UINT16_MAX)) return "Map keys must be unsigned 16-bit integers.";
      const error = validateCborValue(item, depth + 1);
      if (error) return error;
    }
    return null;
  }
  return `Unsupported CBOR value: ${Object.prototype.toString.call(value)}.`;
}

function required(body: Map<unknown, unknown>, key: number, name: string) {
  if (!body.has(key)) throw new Error(`Missing ${name}.`);
  return body.get(key);
}

function requiredUint(body: Map<unknown, unknown>, key: number, maximum: number, name: string) {
  const value = required(body, key, name);
  requireUnsigned(value, maximum, name);
  return value;
}

function requiredText(
  body: Map<unknown, unknown>,
  key: number,
  minimumBytes: number,
  maximumBytes: number,
  name: string,
) {
  const value = required(body, key, name);
  requireText(value, minimumBytes, maximumBytes, name);
  return value;
}

function requiredBytes(
  body: Map<unknown, unknown>,
  key: number,
  minimumBytes: number,
  maximumBytes: number,
  name: string,
) {
  const value = required(body, key, name);
  requireBytes(value, minimumBytes, maximumBytes, name);
  return value.slice();
}

function requireUnsigned(value: unknown, maximum: number, name: string): asserts value is number {
  if (!isUnsignedInteger(value, maximum)) throw new Error(`${name} must be an unsigned integer no greater than ${maximum}.`);
}

function isUnsignedInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function requireText(
  value: unknown,
  minimumBytes: number,
  maximumBytes: number,
  name: string,
): asserts value is string {
  if (typeof value !== "string") throw new Error(`${name} must be text.`);
  const length = textEncoder.encode(value).byteLength;
  if (length < minimumBytes || length > maximumBytes) {
    throw new Error(`${name} must contain ${minimumBytes}–${maximumBytes} UTF-8 bytes.`);
  }
}

function requireBytes(
  value: unknown,
  minimumBytes: number,
  maximumBytes: number,
  name: string,
): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error(`${name} must be a byte string.`);
  if (value.byteLength < minimumBytes || value.byteLength > maximumBytes) {
    throw new Error(`${name} must contain ${minimumBytes}–${maximumBytes} bytes.`);
  }
}

function numberList(
  value: unknown,
  maximumItems: number,
  maximumValue: number,
  name: string,
  requireNonempty = false,
) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  validateNumberList(value, maximumItems, maximumValue, name, requireNonempty);
  return [...value];
}

function optionalNumberList(
  body: Map<unknown, unknown>,
  key: number,
  maximumItems: number,
  name: string,
) {
  return body.has(key) ? numberList(body.get(key), maximumItems, UINT16_MAX, name) : [];
}

function validateNumberList(
  values: unknown[],
  maximumItems: number,
  maximumValue: number,
  name: string,
  requireNonempty = false,
): asserts values is number[] {
  if ((requireNonempty && values.length === 0) || values.length > maximumItems) {
    throw new Error(`${name} must contain ${requireNonempty ? "1–" : "0–"}${maximumItems} items.`);
  }
  const seen = new Set<number>();
  for (const value of values) {
    requireUnsigned(value, maximumValue, `${name} entry`);
    if (seen.has(value)) throw new Error(`${name} must not contain duplicates.`);
    seen.add(value);
  }
}

function mapOf(...entries: ReadonlyArray<readonly [number, unknown]>) {
  return new Map<number, unknown>(entries);
}

function expectedChannel(type: GameNetMessage<unknown, unknown, unknown>["type"]): GameNetChannel {
  return type === "input" || type === "snapshot" || type === "ping" || type === "pong"
    ? "realtime"
    : "reliable";
}

function success<Message>(value: Message): DecodeResult<Message> {
  return { ok: true, value };
}

function failure(code: DecodeErrorCode, message: string): DecodeResult<never> {
  return { ok: false, error: { code, message } };
}
