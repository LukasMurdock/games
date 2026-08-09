import { encode as encodeCbor } from "cbor2";
import { DIRECT_INVITE_VERSION, type DirectInvite, type DirectResponse } from "./types";

const PROOF_DOMAIN = new TextEncoder().encode("GameNet DirectResponse v1\0");

export type CreateDirectInviteOptions = {
  sessionId: Uint8Array;
  peerSlot: number;
  offerSdp: string;
  expiresAt?: number;
};

export function generateDirectSessionId() {
  return randomBytes(16);
}

export function generateInviteSecret() {
  return randomBytes(32);
}

export function createDirectInvite(options: CreateDirectInviteOptions): DirectInvite {
  return {
    type: "invite",
    version: DIRECT_INVITE_VERSION,
    sessionId: options.sessionId.slice(),
    peerSlot: options.peerSlot,
    offerSdp: options.offerSdp,
    inviteSecret: generateInviteSecret(),
    ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
  };
}

export async function createDirectResponse(
  invite: DirectInvite,
  answerSdp: string,
): Promise<DirectResponse> {
  const proof = await signResponseProof(
    invite.inviteSecret,
    invite.sessionId,
    invite.peerSlot,
    answerSdp,
  );
  return {
    type: "response",
    version: DIRECT_INVITE_VERSION,
    sessionId: invite.sessionId.slice(),
    peerSlot: invite.peerSlot,
    answerSdp,
    proof,
  };
}

export async function verifyDirectResponse(invite: DirectInvite, response: DirectResponse) {
  if (
    response.version !== DIRECT_INVITE_VERSION
    || invite.version !== DIRECT_INVITE_VERSION
    || response.peerSlot !== invite.peerSlot
    || !equalBytes(response.sessionId, invite.sessionId)
    || response.proof.byteLength !== 32
  ) return false;
  const key = await importHmacKey(invite.inviteSecret, ["verify"]);
  return crypto.subtle.verify(
    "HMAC",
    key,
    arrayBufferBytes(response.proof),
    responseProofData(response.sessionId, response.peerSlot, response.answerSdp),
  );
}

export async function signResponseProof(
  inviteSecret: Uint8Array,
  sessionId: Uint8Array,
  peerSlot: number,
  answerSdp: string,
) {
  const key = await importHmacKey(inviteSecret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    responseProofData(sessionId, peerSlot, answerSdp),
  );
  return new Uint8Array(signature);
}

export function responseProofData(
  sessionId: Uint8Array,
  peerSlot: number,
  answerSdp: string,
) {
  const tuple = encodeCbor(
    [arrayBufferBytes(sessionId), peerSlot, answerSdp],
    {
      cde: true,
      rejectUndefined: true,
      rejectCustomSimples: true,
      rejectDuplicateKeys: true,
    },
  );
  const result = new Uint8Array(PROOF_DOMAIN.byteLength + tuple.byteLength);
  result.set(PROOF_DOMAIN);
  result.set(tuple, PROOF_DOMAIN.byteLength);
  return result;
}

function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function importHmacKey(secret: Uint8Array, usages: KeyUsage[]) {
  return crypto.subtle.importKey(
    "raw",
    arrayBufferBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

function arrayBufferBytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}
