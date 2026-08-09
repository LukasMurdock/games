import { encode as encodeCbor } from "cbor2";
import { describe, expect, it } from "vitest";
import { DirectInviteCodec } from "./codec";
import type { DirectInvite, DirectResponse } from "./types";

const codec = new DirectInviteCodec();
const invite: DirectInvite = {
  type: "invite",
  version: 1,
  sessionId: hex("00112233445566778899aabbccddeeff"),
  peerSlot: 3,
  offerSdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n",
  inviteSecret: hex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"),
  expiresAt: 2_000_000_000,
};
const response: DirectResponse = {
  type: "response",
  version: 1,
  sessionId: invite.sessionId,
  peerSlot: 3,
  answerSdp: "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\n",
  proof: new Uint8Array(32),
};

describe("DirectInviteCodec", () => {
  it("round-trips typed invite and response messages", () => {
    expect(codec.decodeInvite(codec.encodeInvite(invite))).toEqual({ ok: true, value: invite });
    expect(codec.decodeResponse(codec.encodeResponse(response))).toEqual({ ok: true, value: response });
  });

  it("matches independently generated CDDL fixtures", () => {
    const inviteBytes = hex(
      "8200a60001015000112233445566778899aabbccddeeff020303781f763d300d0a6f3d2d2031203120494e20495034203132372e302e302e310d0a045820000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f051a77359400",
    );
    const responseBytes = hex(
      "8201a50001015000112233445566778899aabbccddeeff020303781f763d300d0a6f3d2d2032203220494e20495034203132372e302e302e310d0a0458200000000000000000000000000000000000000000000000000000000000000000",
    );

    expect(codec.encodeInvite(invite)).toEqual(inviteBytes);
    expect(codec.encodeResponse(response)).toEqual(responseBytes);
    expect(codec.decodeInvite(inviteBytes)).toEqual({ ok: true, value: invite });
    expect(codec.decodeResponse(responseBytes)).toEqual({ ok: true, value: response });
  });

  it("validates then ignores unknown optional fields", () => {
    const bytes = encodeCbor([0, new Map<number, unknown>([
      [0, 1],
      [1, invite.sessionId],
      [2, invite.peerSlot],
      [3, invite.offerSdp],
      [4, invite.inviteSecret],
      [23, new Map([[7, [true, null]]])],
    ])]);

    expect(codec.decodeInvite(bytes)).toEqual({
      ok: true,
      value: {
        type: "invite",
        version: 1,
        sessionId: invite.sessionId,
        peerSlot: invite.peerSlot,
        offerSdp: invite.offerSdp,
        inviteSecret: invite.inviteSecret,
      },
    });
  });

  it.each([
    ["trailing data", new Uint8Array([0, 0])],
    ["duplicate keys", hex("8200a200010001")],
    ["indefinite values", hex("9f00ff")],
    ["tags", hex("c000")],
    ["NaN", hex("f97e00")],
    ["truncated input", hex("8218")],
  ])("returns a decode error rather than throwing for %s", (_name, bytes) => {
    expect(() => codec.decode(bytes)).not.toThrow();
    expect(codec.decode(bytes).ok).toBe(false);
  });

  it("rejects wrong envelope types and malformed fields", () => {
    const reserved = codec.decode(encodeCbor([2, new Map()]));
    const wrongSessionLength = codec.decodeInvite(encodeCbor([0, new Map<number, unknown>([
      [0, 1],
      [1, new Uint8Array(15)],
      [2, 0],
      [3, "v=0"],
      [4, new Uint8Array(32)],
    ])]));

    expect(reserved).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "unexpected-type" }),
    });
    expect(wrongSessionLength).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid-message" }),
    });
  });

  it("enforces payload, text, map, array, and depth limits", () => {
    const oversizedPayload = codec.decode(new Uint8Array(48 * 1024 + 1));
    const oversizedSdp = { ...invite, offerSdp: "x".repeat(32_769) };
    const largeMap = new Map<number, unknown>();
    for (let index = 0; index < 33; index++) largeMap.set(index, 0);
    let nested: unknown = 0;
    for (let index = 0; index < 10; index++) nested = [nested];

    expect(oversizedPayload).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "payload-too-large" }),
    });
    expect(() => codec.encodeInvite(oversizedSdp)).toThrow("32768");
    for (const unknownField of [largeMap, new Array(33).fill(0), nested]) {
      const bytes = encodeCbor([0, new Map<number, unknown>([
        [0, 1],
        [1, invite.sessionId],
        [2, 0],
        [3, "v=0"],
        [4, invite.inviteSecret],
        [9, unknownField],
      ])]);
      expect(codec.decode(bytes).ok).toBe(false);
    }
  });

  it("copies decoded capability bytes", () => {
    const encoded = codec.encodeInvite(invite);
    const decoded = codec.decodeInvite(encoded);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    expect(decoded.value.sessionId).not.toBe(invite.sessionId);
    expect(decoded.value.inviteSecret).not.toBe(invite.inviteSecret);
  });
});

function hex(value: string) {
  return Uint8Array.from(value.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));
}
