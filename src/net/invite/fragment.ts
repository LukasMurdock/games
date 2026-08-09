import { DirectInviteCodec } from "./codec";
import type {
  DirectDecodeResult,
  DirectInvite,
  DirectMessage,
  DirectResponse,
} from "./types";

export type DecodedDirectFragment = {
  kind: "invite" | "response";
  message: DirectMessage;
};

export function encodeInviteFragment(invite: DirectInvite, codec = new DirectInviteCodec()) {
  return `#invite=${encodeBase64Url(codec.encodeInvite(invite))}`;
}

export function encodeResponseFragment(response: DirectResponse, codec = new DirectInviteCodec()) {
  return `#response=${encodeBase64Url(codec.encodeResponse(response))}`;
}

export function createDirectUrl(baseUrl: string, fragment: string) {
  const url = new URL(baseUrl);
  url.hash = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return url.toString();
}

export function decodeDirectFragment(
  input: string,
  codec = new DirectInviteCodec(),
): DirectDecodeResult<DecodedDirectFragment> {
  let hash: string;
  try {
    if (input.startsWith("#")) hash = input;
    else if (/^(invite|response)=/.test(input)) hash = `#${input}`;
    else hash = new URL(input).hash;
  } catch {
    return failure("invalid-fragment", "Direct Invite URL is invalid.");
  }
  const match = /^#(invite|response)=([A-Za-z0-9_-]+)$/.exec(hash);
  if (!match) {
    return failure("invalid-fragment", "Expected exactly one invite or response fragment.");
  }
  const bytes = decodeBase64Url(match[2]);
  if (!bytes.ok) return bytes;
  const decoded = codec.decode(bytes.value);
  if (!decoded.ok) return decoded;
  const kind = match[1] as "invite" | "response";
  if (decoded.value.type !== kind) {
    return failure("invalid-fragment", `Fragment label ${kind} does not match its CBOR envelope.`);
  }
  return { ok: true, value: { kind, message: decoded.value } };
}

export function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function decodeBase64Url(value: string): DirectDecodeResult<Uint8Array> {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    return failure("invalid-base64url", "Direct Invite payload is not canonical base64url.");
  }
  const padding = "=".repeat((4 - value.length % 4) % 4);
  try {
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    if (encodeBase64Url(bytes) !== value) {
      return failure("invalid-base64url", "Direct Invite payload is not canonical base64url.");
    }
    return { ok: true, value: bytes };
  } catch {
    return failure("invalid-base64url", "Direct Invite payload could not be decoded.");
  }
}

function failure<Code extends "invalid-base64url" | "invalid-fragment">(
  code: Code,
  message: string,
): DirectDecodeResult<never> {
  return { ok: false, error: { code, message } };
}
