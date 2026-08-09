import { describe, expect, it } from "vitest";
import { DirectInviteCodec } from "./codec";
import {
  createDirectUrl,
  decodeBase64Url,
  decodeDirectFragment,
  encodeBase64Url,
  encodeInviteFragment,
  encodeResponseFragment,
} from "./fragment";
import type { DirectInvite, DirectResponse } from "./types";

const codec = new DirectInviteCodec();
const invite: DirectInvite = {
  type: "invite",
  version: 1,
  sessionId: new Uint8Array(16).fill(1),
  peerSlot: 7,
  offerSdp: "v=0\r\na=candidate:test\r\n",
  inviteSecret: new Uint8Array(32).fill(2),
};
const response: DirectResponse = {
  type: "response",
  version: 1,
  sessionId: invite.sessionId,
  peerSlot: invite.peerSlot,
  answerSdp: "v=0\r\na=candidate:answer\r\n",
  proof: new Uint8Array(32).fill(3),
};

describe("Direct Invite URL fragments", () => {
  it("round-trips canonical unpadded base64url", () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = encodeBase64Url(bytes);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(encoded).not.toContain("=");
    expect(decodeBase64Url(encoded)).toEqual({ ok: true, value: bytes });
  });

  it("round-trips invite and response links", () => {
    const inviteFragment = encodeInviteFragment(invite, codec);
    const responseFragment = encodeResponseFragment(response, codec);
    const inviteUrl = createDirectUrl("https://game.example/play?mode=private", inviteFragment);

    expect(inviteFragment).toMatch(/^#invite=/u);
    expect(responseFragment).toMatch(/^#response=/u);
    expect(decodeDirectFragment(inviteUrl, codec)).toEqual({
      ok: true,
      value: { kind: "invite", message: invite },
    });
    expect(decodeDirectFragment(responseFragment, codec)).toEqual({
      ok: true,
      value: { kind: "response", message: response },
    });
  });

  it.each([
    "",
    "#invite=",
    "#invite=abc=",
    "#invite=a",
    "#invite=abc&response=def",
    "#other=abc",
    "not a URL",
  ])("rejects malformed fragments without throwing: %s", (value) => {
    expect(() => decodeDirectFragment(value, codec)).not.toThrow();
    expect(decodeDirectFragment(value, codec).ok).toBe(false);
  });

  it("rejects a fragment label that disagrees with its envelope", () => {
    const responseBytes = codec.encodeResponse(response);
    const mislabeled = `#invite=${encodeBase64Url(responseBytes)}`;

    expect(decodeDirectFragment(mislabeled, codec)).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "invalid-fragment" }),
    });
  });

  it("keeps a representative 4 KiB SDP invite measurable", () => {
    const representative = { ...invite, offerSdp: "v".repeat(4096) };
    const fragment = encodeInviteFragment(representative, codec);

    expect(fragment.length).toBe(5555);
    expect(createDirectUrl("https://game.example/", fragment).length).toBe(5576);
  });
});
