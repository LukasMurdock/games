import { describe, expect, it } from "vitest";
import {
  createDirectInvite,
  createDirectResponse,
  generateDirectSessionId,
  generateInviteSecret,
  responseProofData,
  signResponseProof,
  verifyDirectResponse,
} from "./proof";
import { DirectInviteSlot } from "./slot";
import type { DirectInvite } from "./types";

const invite: DirectInvite = {
  type: "invite",
  version: 1,
  sessionId: hex("00112233445566778899aabbccddeeff"),
  peerSlot: 3,
  offerSdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n",
  inviteSecret: hex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"),
  expiresAt: 2_000_000_000,
};
const answerSdp = "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\n";

describe("Direct Invite response proofs", () => {
  it("matches an independently generated deterministic HMAC fixture", async () => {
    expect(hexString(responseProofData(invite.sessionId, invite.peerSlot, answerSdp))).toBe(
      "47616d654e657420446972656374526573706f6e736520763100835000112233445566778899aabbccddeeff03781f763d300d0a6f3d2d2032203220494e20495034203132372e302e302e310d0a",
    );

    const proof = await signResponseProof(
      invite.inviteSecret,
      invite.sessionId,
      invite.peerSlot,
      answerSdp,
    );

    expect(hexString(proof)).toBe("6d970529b604d4acf2b2808087a355a7aefbf381ad21f43a9b5523e145b4caf8");
  });

  it("creates and verifies a bound response", async () => {
    const response = await createDirectResponse(invite, answerSdp);

    expect(response).toEqual({
      type: "response",
      version: 1,
      sessionId: invite.sessionId,
      peerSlot: invite.peerSlot,
      answerSdp,
      proof: expect.any(Uint8Array),
    });
    expect(response.sessionId).not.toBe(invite.sessionId);
    await expect(verifyDirectResponse(invite, response)).resolves.toBe(true);
  });

  it.each([
    ["session", (response: Awaited<ReturnType<typeof createDirectResponse>>) => ({ ...response, sessionId: new Uint8Array(16).fill(9) })],
    ["slot", (response: Awaited<ReturnType<typeof createDirectResponse>>) => ({ ...response, peerSlot: response.peerSlot + 1 })],
    ["answer", (response: Awaited<ReturnType<typeof createDirectResponse>>) => ({ ...response, answerSdp: `${response.answerSdp}tampered` })],
    ["proof", (response: Awaited<ReturnType<typeof createDirectResponse>>) => ({ ...response, proof: new Uint8Array(32) })],
  ])("rejects a response with the wrong %s", async (_name, mutate) => {
    const response = await createDirectResponse(invite, answerSdp);
    await expect(verifyDirectResponse(invite, mutate(response))).resolves.toBe(false);
  });

  it("rejects a proof made with another invite secret", async () => {
    const response = await createDirectResponse(invite, answerSdp);
    const anotherInvite = { ...invite, inviteSecret: new Uint8Array(32).fill(4) };

    await expect(verifyDirectResponse(anotherInvite, response)).resolves.toBe(false);
  });

  it("generates correctly sized random capabilities", () => {
    const firstSession = generateDirectSessionId();
    const secondSession = generateDirectSessionId();
    const firstSecret = generateInviteSecret();
    const generated = createDirectInvite({
      sessionId: firstSession,
      peerSlot: 8,
      offerSdp: "v=0",
    });

    expect(firstSession).toHaveLength(16);
    expect(firstSecret).toHaveLength(32);
    expect(firstSession).not.toEqual(secondSession);
    expect(generated.sessionId).not.toBe(firstSession);
    expect(generated.inviteSecret).toHaveLength(32);
  });
});

describe("DirectInviteSlot", () => {
  it("consumes one valid response exactly once", async () => {
    const slot = new DirectInviteSlot(invite, () => 1_900_000_000);
    const response = await createDirectResponse(invite, answerSdp);

    await expect(slot.consume(response)).resolves.toEqual({ ok: true, answerSdp });
    expect(slot.consumed).toBe(true);
    await expect(slot.consume(response)).resolves.toEqual({ ok: false, reason: "consumed" });
  });

  it("allows a valid retry after rejecting an invalid response", async () => {
    const slot = new DirectInviteSlot(invite, () => 1_900_000_000);
    const response = await createDirectResponse(invite, answerSdp);
    const invalid = { ...response, peerSlot: 9 };

    await expect(slot.consume(invalid)).resolves.toEqual({ ok: false, reason: "invalid-response" });
    await expect(slot.consume(response)).resolves.toEqual({ ok: true, answerSdp });
  });

  it("rejects expired responses without consuming the slot", async () => {
    const slot = new DirectInviteSlot(invite, () => invite.expiresAt ?? 0);
    const response = await createDirectResponse(invite, answerSdp);

    await expect(slot.consume(response)).resolves.toEqual({ ok: false, reason: "expired" });
    expect(slot.consumed).toBe(false);
  });

  it("prevents concurrent replay races", async () => {
    const slot = new DirectInviteSlot(invite, () => 1_900_000_000);
    const response = await createDirectResponse(invite, answerSdp);
    const results = await Promise.all([slot.consume(response), slot.consume(response)]);

    expect(results).toContainEqual({ ok: true, answerSdp });
    expect(results).toContainEqual({ ok: false, reason: "consumed" });
  });
});

function hex(value: string) {
  return Uint8Array.from(value.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));
}

function hexString(value: Uint8Array) {
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
