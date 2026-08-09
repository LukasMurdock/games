export const DIRECT_INVITE_VERSION = 1 as const;

export type DirectInvite = {
  type: "invite";
  version: 1;
  sessionId: Uint8Array;
  peerSlot: number;
  offerSdp: string;
  inviteSecret: Uint8Array;
  expiresAt?: number;
};

export type DirectResponse = {
  type: "response";
  version: 1;
  sessionId: Uint8Array;
  peerSlot: number;
  answerSdp: string;
  proof: Uint8Array;
};

export type DirectMessage = DirectInvite | DirectResponse;

export type DirectDecodeErrorCode =
  | "payload-too-large"
  | "malformed-cbor"
  | "limit-exceeded"
  | "invalid-envelope"
  | "invalid-message"
  | "unexpected-type"
  | "invalid-base64url"
  | "invalid-fragment";

export type DirectDecodeResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; error: { code: DirectDecodeErrorCode; message: string } };
