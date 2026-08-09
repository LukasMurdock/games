import { GameNetCodec } from "../protocol/codec";
import {
  DisconnectCode,
  type EventMessage,
  type GameNetMessage,
  type HelloMessage,
  type ProtocolErrorMessage,
  type SnapshotMessage,
  type WelcomeMessage,
} from "../protocol/messages";
import { validateWelcome } from "../protocol/negotiation";
import type { PeerConnection } from "../transport/peer";

export type ClientRuntimeState = "idle" | "negotiating" | "connected" | "closed";

export type ClientRuntimeError = {
  kind: "decode" | "protocol" | "transport";
  message: string;
  protocolError?: ProtocolErrorMessage;
};

export type ClientRuntimeOptions<Input, Snapshot, Event> = {
  peer: PeerConnection;
  codec: GameNetCodec<Input, Snapshot, Event>;
  gameId: string;
  rulesetId: Uint8Array;
  features?: number[];
};

export class ClientRuntime<Input, Snapshot, Event> {
  private readonly peer: PeerConnection;
  private readonly codec: GameNetCodec<Input, Snapshot, Event>;
  private readonly hello: HelloMessage;
  private readonly stateHandlers = new Set<(state: ClientRuntimeState) => void>();
  private readonly snapshotHandlers = new Set<(message: SnapshotMessage<Snapshot>) => void>();
  private readonly eventHandlers = new Set<(message: EventMessage<Event>) => void>();
  private readonly errorHandlers = new Set<(error: ClientRuntimeError) => void>();
  private readonly closeHandlers = new Set<() => void>();
  private currentState: ClientRuntimeState = "idle";
  private closeEmitted = false;
  private nextInputSequence = 0;
  private selectedFeatures: number[] = [];
  private assignedPlayerId: string | null = null;

  constructor(options: ClientRuntimeOptions<Input, Snapshot, Event>) {
    this.peer = options.peer;
    this.codec = options.codec;
    this.hello = {
      type: "hello",
      supportedProtocolMajors: [1],
      gameId: options.gameId,
      rulesetId: options.rulesetId.slice(),
      features: [...(options.features ?? [])],
    };
    this.peer.onReliable((bytes) => this.receive(bytes, "reliable"));
    this.peer.onRealtime((bytes) => this.receive(bytes, "realtime"));
    this.peer.onError((error) => {
      this.emitError({ kind: "transport", message: error.message });
      this.peer.close();
    });
    this.peer.onClose(() => this.finishClose());
  }

  get state() {
    return this.currentState;
  }

  get playerId() {
    return this.assignedPlayerId;
  }

  get features(): readonly number[] {
    return this.selectedFeatures;
  }

  start(): void {
    if (this.currentState !== "idle") throw new Error("ClientRuntime can only start once.");
    this.setState("negotiating");
    this.peer.sendReliable(this.codec.encode(this.hello));
  }

  sendInput(input: Input): number {
    if (this.currentState !== "connected") throw new Error("Client is not connected.");
    if (this.nextInputSequence > 4_294_967_295) throw new Error("Input sequence is exhausted.");
    const sequence = this.nextInputSequence;
    this.nextInputSequence += 1;
    this.peer.sendRealtime(this.codec.encode({ type: "input", sequence, input }));
    return sequence;
  }

  ping(requestId: number): void {
    if (this.currentState !== "connected") throw new Error("Client is not connected.");
    this.peer.sendRealtime(this.codec.encode({ type: "ping", requestId }));
  }

  close(): void {
    if (this.currentState === "closed") return;
    if (this.currentState === "connected") {
      try {
        this.peer.sendReliable(this.codec.encode({
          type: "disconnect",
          code: DisconnectCode.Normal,
          diagnostic: "Client left the session.",
        }));
      } catch {
        // The transport may already be gone.
      }
    }
    queueMicrotask(() => this.peer.close());
  }

  onState(handler: (state: ClientRuntimeState) => void): void {
    this.stateHandlers.add(handler);
    handler(this.currentState);
  }

  onSnapshot(handler: (message: SnapshotMessage<Snapshot>) => void): void {
    this.snapshotHandlers.add(handler);
  }

  onEvent(handler: (message: EventMessage<Event>) => void): void {
    this.eventHandlers.add(handler);
  }

  onError(handler: (error: ClientRuntimeError) => void): void {
    this.errorHandlers.add(handler);
  }

  onClose(handler: () => void): void {
    this.closeHandlers.add(handler);
    if (this.closeEmitted) handler();
  }

  private receive(bytes: Uint8Array, channel: "reliable" | "realtime") {
    if (this.currentState === "closed") return;
    const decoded = this.codec.decodeForChannel(bytes, channel);
    if (!decoded.ok) {
      this.fail("decode", decoded.error.message);
      return;
    }
    this.handleMessage(decoded.value);
  }

  private handleMessage(message: GameNetMessage<Input, Snapshot, Event>) {
    if (this.currentState === "negotiating") {
      if (message.type === "welcome") {
        this.acceptWelcome(message);
        return;
      }
      if (message.type === "error") {
        this.receiveProtocolError(message);
        return;
      }
      if (message.type === "disconnect") {
        this.peer.close();
        return;
      }
      this.fail("protocol", `${message.type} is not valid before WELCOME.`);
      return;
    }
    if (this.currentState !== "connected") return;

    switch (message.type) {
      case "snapshot":
        for (const handler of this.snapshotHandlers) handler(message);
        return;
      case "event":
        for (const handler of this.eventHandlers) handler(message);
        return;
      case "ping":
        this.peer.sendRealtime(this.codec.encode({ type: "pong", requestId: message.requestId }));
        return;
      case "pong":
        return;
      case "disconnect":
        this.peer.close();
        return;
      case "error":
        this.receiveProtocolError(message);
        return;
      default:
        this.fail("protocol", `${message.type} is not valid from a host.`);
    }
  }

  private acceptWelcome(welcome: WelcomeMessage) {
    const validation = validateWelcome(this.hello, welcome);
    if (!validation.ok) {
      this.fail("protocol", validation.message);
      return;
    }
    this.assignedPlayerId = validation.playerId;
    this.selectedFeatures = validation.features;
    this.setState("connected");
  }

  private receiveProtocolError(error: ProtocolErrorMessage) {
    this.emitError({
      kind: "protocol",
      message: error.diagnostic ?? `Protocol error ${error.code}.`,
      protocolError: error,
    });
  }

  private fail(kind: "decode" | "protocol", message: string) {
    this.emitError({ kind, message });
    this.peer.close();
  }

  private emitError(error: ClientRuntimeError) {
    for (const handler of this.errorHandlers) handler(error);
  }

  private setState(state: ClientRuntimeState) {
    if (this.currentState === state) return;
    this.currentState = state;
    for (const handler of this.stateHandlers) handler(state);
  }

  private finishClose() {
    if (this.closeEmitted) return;
    this.closeEmitted = true;
    this.setState("closed");
    for (const handler of this.closeHandlers) handler();
  }
}
