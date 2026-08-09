export const GAME_NET_PROTOCOL_MAJOR = 1 as const;

export const MessageType = {
  Hello: 0,
  Welcome: 1,
  Input: 2,
  Snapshot: 3,
  Event: 4,
  Ping: 5,
  Pong: 6,
  Disconnect: 7,
  Error: 8,
} as const;

export const ProtocolErrorCode = {
  NoCommonProtocol: 0,
  GameMismatch: 1,
  RulesetMismatch: 2,
  MalformedMessage: 3,
  LimitExceeded: 4,
  UnexpectedMessage: 5,
  UnsupportedMessage: 6,
  ChannelMismatch: 7,
} as const;

export const DisconnectCode = {
  Normal: 0,
  HostEndedSession: 1,
  ProtocolError: 2,
  Timeout: 3,
} as const;

export type HelloMessage = {
  type: "hello";
  supportedProtocolMajors: number[];
  gameId: string;
  rulesetId: Uint8Array;
  features: number[];
};

export type WelcomeMessage = {
  type: "welcome";
  protocolMajor: 1;
  playerId: string;
  gameId: string;
  rulesetId: Uint8Array;
  features: number[];
};

export type InputMessage<Input> = {
  type: "input";
  sequence: number;
  input: Input;
};

export type SnapshotMessage<Snapshot> = {
  type: "snapshot";
  tick: number;
  snapshot: Snapshot;
};

export type EventMessage<Event> = {
  type: "event";
  tick: number;
  event: Event;
};

export type PingMessage = { type: "ping"; requestId: number };
export type PongMessage = { type: "pong"; requestId: number };

export type DisconnectMessage = {
  type: "disconnect";
  code: number;
  diagnostic?: string;
};

export type ProtocolErrorMessage = {
  type: "error";
  code: number;
  diagnostic?: string;
};

export type GameNetMessage<Input, Snapshot, Event> =
  | HelloMessage
  | WelcomeMessage
  | InputMessage<Input>
  | SnapshotMessage<Snapshot>
  | EventMessage<Event>
  | PingMessage
  | PongMessage
  | DisconnectMessage
  | ProtocolErrorMessage;

export type PayloadDecodeResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; message: string };

export interface GamePayloadCodec<Input, Snapshot, Event> {
  encodeInput(input: Input): unknown;
  decodeInput(value: unknown): PayloadDecodeResult<Input>;
  encodeSnapshot(snapshot: Snapshot): unknown;
  decodeSnapshot(value: unknown): PayloadDecodeResult<Snapshot>;
  encodeEvent(event: Event): unknown;
  decodeEvent(value: unknown): PayloadDecodeResult<Event>;
}
