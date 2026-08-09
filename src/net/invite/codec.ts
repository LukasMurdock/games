import { decode as decodeCbor, encode as encodeCbor } from "cbor2";
import {
  DIRECT_INVITE_VERSION,
  type DirectDecodeErrorCode,
  type DirectDecodeResult,
  type DirectInvite,
  type DirectMessage,
  type DirectResponse,
} from "./types";

export const DIRECT_INVITE_LIMITS = {
  maximumPayloadBytes: 48 * 1024,
  maximumDepth: 8,
  maximumMapEntries: 32,
  maximumArrayItems: 32,
  maximumTextBytes: 32_768,
  maximumByteStringBytes: 32_768,
  sessionIdBytes: 16,
  secretBytes: 32,
  proofBytes: 32,
} as const;

const UINT16_MAX = 65_535;
const UINT32_MAX = 4_294_967_295;
const MAXIMUM_SAFE_UINT = Number.MAX_SAFE_INTEGER;
const textEncoder = new TextEncoder();

const decoderOptions = {
  maxDepth: DIRECT_INVITE_LIMITS.maximumDepth,
  rejectStreaming: true,
  rejectDuplicateKeys: true,
  rejectUndefined: true,
  rejectSimple: true,
  preferMap: true,
  ignoreGlobalTags: true,
} as const;

const encoderOptions = {
  cde: true,
  rejectUndefined: true,
  rejectCustomSimples: true,
  rejectDuplicateKeys: true,
} as const;

export class DirectInviteCodec {
  encodeInvite(invite: DirectInvite): Uint8Array {
    validateInvite(invite);
    return encodeBounded([
      0,
      mapOf(
        [0, invite.version],
        [1, invite.sessionId],
        [2, invite.peerSlot],
        [3, invite.offerSdp],
        [4, invite.inviteSecret],
        ...(invite.expiresAt === undefined ? [] : [[5, invite.expiresAt] as const]),
      ),
    ]);
  }

  encodeResponse(response: DirectResponse): Uint8Array {
    validateResponse(response);
    return encodeBounded([
      1,
      mapOf(
        [0, response.version],
        [1, response.sessionId],
        [2, response.peerSlot],
        [3, response.answerSdp],
        [4, response.proof],
      ),
    ]);
  }

  decode(bytes: Uint8Array): DirectDecodeResult<DirectMessage> {
    if (bytes.byteLength > DIRECT_INVITE_LIMITS.maximumPayloadBytes) {
      return failure(
        "payload-too-large",
        `Direct Invite payload exceeds ${DIRECT_INVITE_LIMITS.maximumPayloadBytes} bytes.`,
      );
    }
    let wireValue: unknown;
    try {
      wireValue = decodeCbor<unknown>(bytes, decoderOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : "CBOR decoding failed.";
      return failure(
        /depth|size|length/i.test(message) ? "limit-exceeded" : "malformed-cbor",
        message,
      );
    }
    const structuralError = validateCborValue(wireValue);
    if (structuralError) return failure(structuralError.limit ? "limit-exceeded" : "malformed-cbor", structuralError.message);
    if (!Array.isArray(wireValue) || wireValue.length !== 2) {
      return failure("invalid-envelope", "Direct Invite messages must be two-item arrays.");
    }
    const [type, body] = wireValue;
    if (!isUnsignedInteger(type, UINT16_MAX) || !(body instanceof Map)) {
      return failure("invalid-envelope", "Direct Invite envelope type or body is invalid.");
    }
    try {
      if (type === 0) return success(decodeInviteBody(body));
      if (type === 1) return success(decodeResponseBody(body));
      return failure("unexpected-type", `Unsupported Direct Invite envelope type ${type}.`);
    } catch (error) {
      return failure(
        "invalid-message",
        error instanceof Error ? error.message : "Direct Invite message validation failed.",
      );
    }
  }

  decodeInvite(bytes: Uint8Array): DirectDecodeResult<DirectInvite> {
    const decoded = this.decode(bytes);
    if (!decoded.ok) return decoded;
    return decoded.value.type === "invite"
      ? success(decoded.value)
      : failure("unexpected-type", "Expected a Direct Invite, received a response.");
  }

  decodeResponse(bytes: Uint8Array): DirectDecodeResult<DirectResponse> {
    const decoded = this.decode(bytes);
    if (!decoded.ok) return decoded;
    return decoded.value.type === "response"
      ? success(decoded.value)
      : failure("unexpected-type", "Expected a Direct Response, received an invite.");
  }
}

function decodeInviteBody(body: Map<unknown, unknown>): DirectInvite {
  const version = requiredUint(body, 0, UINT16_MAX, "format version");
  if (version !== DIRECT_INVITE_VERSION) throw new Error(`Unsupported Direct Invite version ${version}.`);
  const expiresAt = body.has(5)
    ? requiredUint(body, 5, MAXIMUM_SAFE_UINT, "expiry")
    : undefined;
  return {
    type: "invite",
    version,
    sessionId: requiredBytes(body, 1, 16, "session ID"),
    peerSlot: requiredUint(body, 2, UINT32_MAX, "peer slot"),
    offerSdp: requiredText(body, 3, "offer SDP"),
    inviteSecret: requiredBytes(body, 4, 32, "invite secret"),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

function decodeResponseBody(body: Map<unknown, unknown>): DirectResponse {
  const version = requiredUint(body, 0, UINT16_MAX, "format version");
  if (version !== DIRECT_INVITE_VERSION) throw new Error(`Unsupported Direct Invite version ${version}.`);
  return {
    type: "response",
    version,
    sessionId: requiredBytes(body, 1, 16, "session ID"),
    peerSlot: requiredUint(body, 2, UINT32_MAX, "peer slot"),
    answerSdp: requiredText(body, 3, "answer SDP"),
    proof: requiredBytes(body, 4, 32, "response proof"),
  };
}

function validateInvite(invite: DirectInvite) {
  if (invite.version !== DIRECT_INVITE_VERSION) throw new Error("Direct Invite version must be 1.");
  requireByteLength(invite.sessionId, 16, "Session ID");
  requireUnsigned(invite.peerSlot, UINT32_MAX, "Peer slot");
  requireSdp(invite.offerSdp, "Offer SDP");
  requireByteLength(invite.inviteSecret, 32, "Invite secret");
  if (invite.expiresAt !== undefined) requireUnsigned(invite.expiresAt, MAXIMUM_SAFE_UINT, "Expiry");
}

function validateResponse(response: DirectResponse) {
  if (response.version !== DIRECT_INVITE_VERSION) throw new Error("Direct Response version must be 1.");
  requireByteLength(response.sessionId, 16, "Session ID");
  requireUnsigned(response.peerSlot, UINT32_MAX, "Peer slot");
  requireSdp(response.answerSdp, "Answer SDP");
  requireByteLength(response.proof, 32, "Response proof");
}

function encodeBounded(value: unknown) {
  const structuralError = validateCborValue(value);
  if (structuralError) throw new Error(structuralError.message);
  const bytes = encodeCbor(value, encoderOptions);
  if (bytes.byteLength > DIRECT_INVITE_LIMITS.maximumPayloadBytes) {
    throw new Error(`Encoded Direct Invite exceeds ${DIRECT_INVITE_LIMITS.maximumPayloadBytes} bytes.`);
  }
  return bytes;
}

type StructuralError = { limit: boolean; message: string };

function validateCborValue(value: unknown, depth = 0): StructuralError | null {
  if (depth > DIRECT_INVITE_LIMITS.maximumDepth) {
    return { limit: true, message: `Maximum nesting depth ${DIRECT_INVITE_LIMITS.maximumDepth} exceeded.` };
  }
  if (value === null || typeof value === "boolean") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { limit: false, message: "NaN and infinity are not allowed." };
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      return { limit: false, message: "Unsafe integers are not allowed." };
    }
    return null;
  }
  if (typeof value === "string") {
    return textEncoder.encode(value).byteLength <= DIRECT_INVITE_LIMITS.maximumTextBytes
      ? null
      : { limit: true, message: `Text exceeds ${DIRECT_INVITE_LIMITS.maximumTextBytes} UTF-8 bytes.` };
  }
  if (value instanceof Uint8Array) {
    return value.byteLength <= DIRECT_INVITE_LIMITS.maximumByteStringBytes
      ? null
      : { limit: true, message: `Byte string exceeds ${DIRECT_INVITE_LIMITS.maximumByteStringBytes} bytes.` };
  }
  if (Array.isArray(value)) {
    if (value.length > DIRECT_INVITE_LIMITS.maximumArrayItems) {
      return { limit: true, message: `Array exceeds ${DIRECT_INVITE_LIMITS.maximumArrayItems} items.` };
    }
    for (const item of value) {
      const error = validateCborValue(item, depth + 1);
      if (error) return error;
    }
    return null;
  }
  if (value instanceof Map) {
    if (value.size > DIRECT_INVITE_LIMITS.maximumMapEntries) {
      return { limit: true, message: `Map exceeds ${DIRECT_INVITE_LIMITS.maximumMapEntries} entries.` };
    }
    for (const [key, item] of value) {
      if (!isUnsignedInteger(key, UINT16_MAX)) {
        return { limit: false, message: "Direct Invite map keys must be unsigned 16-bit integers." };
      }
      const error = validateCborValue(item, depth + 1);
      if (error) return error;
    }
    return null;
  }
  return {
    limit: false,
    message: `Unsupported CBOR value: ${Object.prototype.toString.call(value)}.`,
  };
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

function requiredText(body: Map<unknown, unknown>, key: number, name: string) {
  const value = required(body, key, name);
  requireSdp(value, name);
  return value;
}

function requiredBytes(body: Map<unknown, unknown>, key: number, length: number, name: string) {
  const value = required(body, key, name);
  requireByteLength(value, length, name);
  return value.slice();
}

function requireUnsigned(value: unknown, maximum: number, name: string): asserts value is number {
  if (!isUnsignedInteger(value, maximum)) {
    throw new Error(`${name} must be an unsigned integer no greater than ${maximum}.`);
  }
}

function isUnsignedInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function requireSdp(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") throw new Error(`${name} must be text.`);
  const length = textEncoder.encode(value).byteLength;
  if (length < 1 || length > DIRECT_INVITE_LIMITS.maximumTextBytes) {
    throw new Error(`${name} must contain 1–${DIRECT_INVITE_LIMITS.maximumTextBytes} UTF-8 bytes.`);
  }
}

function requireByteLength(value: unknown, length: number, name: string): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength !== length) {
    throw new Error(`${name} must contain exactly ${length} bytes.`);
  }
}

function mapOf(...entries: ReadonlyArray<readonly [number, unknown]>) {
  return new Map<number, unknown>(entries);
}

function success<Value>(value: Value): DirectDecodeResult<Value> {
  return { ok: true, value };
}

function failure(code: DirectDecodeErrorCode, message: string): DirectDecodeResult<never> {
  return { ok: false, error: { code, message } };
}
