import {
  GAME_NET_PROTOCOL_MAJOR,
  ProtocolErrorCode,
  type HelloMessage,
  type ProtocolErrorMessage,
  type WelcomeMessage,
} from "./messages";

export type HostNegotiationConfig = {
  gameId: string;
  rulesetId: Uint8Array;
  features: readonly number[];
  createPlayerId: () => string;
};

export type HostNegotiationResult =
  | { ok: true; welcome: WelcomeMessage }
  | { ok: false; error: ProtocolErrorMessage };

export type WelcomeValidationResult =
  | { ok: true; protocolMajor: 1; playerId: string; features: number[] }
  | { ok: false; message: string };

export function negotiateHello(
  hello: HelloMessage,
  config: HostNegotiationConfig,
): HostNegotiationResult {
  if (!hello.supportedProtocolMajors.includes(GAME_NET_PROTOCOL_MAJOR)) {
    return rejected(ProtocolErrorCode.NoCommonProtocol, "No common protocol major.");
  }
  if (hello.gameId !== config.gameId) {
    return rejected(ProtocolErrorCode.GameMismatch, "Game ID does not match.");
  }
  if (!equalBytes(hello.rulesetId, config.rulesetId)) {
    return rejected(ProtocolErrorCode.RulesetMismatch, "Ruleset ID does not match.");
  }
  const supportedFeatures = new Set(config.features);
  const features = hello.features.filter((feature) => supportedFeatures.has(feature));
  return {
    ok: true,
    welcome: {
      type: "welcome",
      protocolMajor: GAME_NET_PROTOCOL_MAJOR,
      playerId: config.createPlayerId(),
      gameId: config.gameId,
      rulesetId: config.rulesetId.slice(),
      features,
    },
  };
}

export function validateWelcome(
  hello: HelloMessage,
  welcome: WelcomeMessage,
): WelcomeValidationResult {
  if (!hello.supportedProtocolMajors.includes(welcome.protocolMajor)) {
    return { ok: false, message: "Host selected a protocol major the client did not offer." };
  }
  if (welcome.gameId !== hello.gameId) {
    return { ok: false, message: "Host confirmed a different game ID." };
  }
  if (!equalBytes(welcome.rulesetId, hello.rulesetId)) {
    return { ok: false, message: "Host confirmed a different ruleset ID." };
  }
  const offeredFeatures = new Set(hello.features);
  if (welcome.features.some((feature) => !offeredFeatures.has(feature))) {
    return { ok: false, message: "Host selected a feature the client did not offer." };
  }
  return {
    ok: true,
    protocolMajor: welcome.protocolMajor,
    playerId: welcome.playerId,
    features: [...welcome.features],
  };
}

function rejected(code: number, diagnostic: string): HostNegotiationResult {
  return { ok: false, error: { type: "error", code, diagnostic } };
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
