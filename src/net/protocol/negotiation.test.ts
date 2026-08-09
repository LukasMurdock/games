import { describe, expect, it, vi } from "vitest";
import { ProtocolErrorCode, type HelloMessage, type WelcomeMessage } from "./messages";
import { negotiateHello, validateWelcome } from "./negotiation";

const rulesetId = new Uint8Array(16).fill(7);
const hello: HelloMessage = {
  type: "hello",
  supportedProtocolMajors: [1],
  gameId: "moving-circles",
  rulesetId,
  features: [32, 33],
};

describe("GameNet negotiation", () => {
  it("selects protocol 1 and the supported feature intersection", () => {
    const createPlayerId = vi.fn(() => "player-3");

    const result = negotiateHello(hello, {
      gameId: "moving-circles",
      rulesetId,
      features: [33, 34],
      createPlayerId,
    });

    expect(result).toEqual({
      ok: true,
      welcome: {
        type: "welcome",
        protocolMajor: 1,
        playerId: "player-3",
        gameId: "moving-circles",
        rulesetId,
        features: [33],
      },
    });
    expect(createPlayerId).toHaveBeenCalledOnce();
    expect(result.ok && result.welcome.rulesetId).not.toBe(rulesetId);
  });

  it.each([
    ["protocol", { ...hello, supportedProtocolMajors: [2] }, ProtocolErrorCode.NoCommonProtocol],
    ["game", { ...hello, gameId: "other-game" }, ProtocolErrorCode.GameMismatch],
    ["ruleset", { ...hello, rulesetId: new Uint8Array(16).fill(8) }, ProtocolErrorCode.RulesetMismatch],
  ])("rejects an incompatible %s", (_name, candidate, code) => {
    const result = negotiateHello(candidate, {
      gameId: "moving-circles",
      rulesetId,
      features: [],
      createPlayerId: () => "unused",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ type: "error", code }),
    });
  });

  it("validates a compatible welcome", () => {
    const welcome: WelcomeMessage = {
      type: "welcome",
      protocolMajor: 1,
      playerId: "player-3",
      gameId: hello.gameId,
      rulesetId: rulesetId.slice(),
      features: [32],
    };

    expect(validateWelcome(hello, welcome)).toEqual({
      ok: true,
      protocolMajor: 1,
      playerId: "player-3",
      features: [32],
    });
  });

  it.each([
    ["game", { gameId: "other-game" }],
    ["ruleset", { rulesetId: new Uint8Array(16).fill(9) }],
    ["feature", { features: [34] }],
  ])("rejects a welcome that changes the offered %s", (_name, change) => {
    const welcome: WelcomeMessage = {
      type: "welcome",
      protocolMajor: 1,
      playerId: "player-3",
      gameId: hello.gameId,
      rulesetId,
      features: [],
      ...change,
    };

    expect(validateWelcome(hello, welcome).ok).toBe(false);
  });
});
