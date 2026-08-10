import { GameNetCodec, type DecodeErrorCode } from "../protocol/codec";
import {
  DisconnectCode,
  ProtocolErrorCode,
  type EventMessage,
  type GameNetMessage,
} from "../protocol/messages";
import { negotiateHello } from "../protocol/negotiation";
import type { PeerConnection } from "../transport/peer";
import type { GameSimulation } from "./simulation";

export type HostRuntimeOptions<Config, Input, State, Snapshot, Event> = {
  simulation: GameSimulation<Config, Input, State, Snapshot, Event>;
  simulationConfig: Config;
  codec: GameNetCodec<Input, Snapshot, Event>;
  gameId: string;
  rulesetId: Uint8Array;
  features?: readonly number[];
  createPlayerId: (peerId: string) => string;
  tickRate?: number;
  snapshotRate?: number;
  maximumCatchUpSteps?: number;
  now?: () => number;
};

type PeerRecord = {
  peer: PeerConnection;
  playerId: string | null;
  lastInputSequence: number;
  strikes: number[];
  closing: boolean;
};

const STRIKE_WINDOW_MS = 10_000;
const MAXIMUM_STRIKES = 3;

export class HostRuntime<Config, Input, State, Snapshot, Event> {
  private readonly simulation: GameSimulation<Config, Input, State, Snapshot, Event>;
  private readonly codec: GameNetCodec<Input, Snapshot, Event>;
  private readonly gameId: string;
  private readonly rulesetId: Uint8Array;
  private readonly features: readonly number[];
  private readonly createPlayerId: (peerId: string) => string;
  private readonly fixedDt: number;
  private readonly snapshotInterval: number;
  private readonly maximumCatchUpSteps: number;
  private readonly now: () => number;
  private readonly peers = new Map<PeerConnection, PeerRecord>();
  private readonly state: State;
  private accumulator = 0;
  private snapshotAccumulator = 0;
  private tickNumber = 0;
  private closed = false;

  constructor(options: HostRuntimeOptions<Config, Input, State, Snapshot, Event>) {
    const tickRate = options.tickRate ?? 60;
    const snapshotRate = options.snapshotRate ?? 20;
    if (!(tickRate > 0) || !(snapshotRate > 0) || snapshotRate > tickRate) {
      throw new Error("HostRuntime requires 0 < snapshotRate <= tickRate.");
    }
    this.simulation = options.simulation;
    this.codec = options.codec;
    this.gameId = options.gameId;
    this.rulesetId = options.rulesetId.slice();
    this.features = options.features ?? [];
    this.createPlayerId = options.createPlayerId;
    this.fixedDt = 1 / tickRate;
    this.snapshotInterval = 1 / snapshotRate;
    this.maximumCatchUpSteps = options.maximumCatchUpSteps ?? 8;
    this.now = options.now ?? (() => performance.now());
    this.state = this.simulation.create(options.simulationConfig);
  }

  get tick() {
    return this.tickNumber;
  }

  get playerCount() {
    let count = 0;
    for (const record of this.peers.values()) if (record.playerId !== null) count += 1;
    return count;
  }

  getSnapshot(): Snapshot {
    return this.simulation.snapshot(this.state);
  }

  /** Executes a synchronous authority-only state transition owned by the host application. */
  control<Result>(transition: (state: State) => Result): Result {
    if (this.closed) throw new Error("HostRuntime is closed.");
    return transition(this.state);
  }

  publishHostEvent(event: Event): void {
    if (this.closed) throw new Error("HostRuntime is closed.");
    this.publishEvents([event]);
  }

  attach(peer: PeerConnection): void {
    if (this.closed) {
      peer.close();
      return;
    }
    if (this.peers.has(peer)) throw new Error(`Peer ${peer.peerId} is already attached.`);
    const record: PeerRecord = {
      peer,
      playerId: null,
      lastInputSequence: -1,
      strikes: [],
      closing: false,
    };
    this.peers.set(peer, record);
    peer.onReliable((bytes) => this.receive(record, bytes, "reliable"));
    peer.onRealtime((bytes) => this.receive(record, bytes, "realtime"));
    peer.onError(() => this.closePeer(record));
    peer.onClose(() => this.removePeer(record));
  }

  advance(elapsedSeconds: number): void {
    if (this.closed || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return;
    this.accumulator += elapsedSeconds;
    let steps = 0;
    while (this.accumulator + Number.EPSILON >= this.fixedDt && steps < this.maximumCatchUpSteps) {
      this.accumulator -= this.fixedDt;
      this.step();
      steps += 1;
    }
    if (steps === this.maximumCatchUpSteps && this.accumulator >= this.fixedDt) {
      this.accumulator %= this.fixedDt;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const record of [...this.peers.values()]) {
      this.sendReliable(record, {
        type: "disconnect",
        code: DisconnectCode.HostEndedSession,
        diagnostic: "Host ended the session.",
      });
      this.closePeer(record);
    }
  }

  private step() {
    if (this.playerCount === 0) return;
    this.tickNumber += 1;
    this.publishEvents(this.simulation.tick(this.state, this.fixedDt));
    this.snapshotAccumulator += this.fixedDt;
    if (this.snapshotAccumulator + Number.EPSILON < this.snapshotInterval) return;
    this.snapshotAccumulator %= this.snapshotInterval;
    const bytes = this.codec.encode({
      type: "snapshot",
      tick: this.tickNumber,
      snapshot: this.simulation.snapshot(this.state),
    });
    for (const record of this.authenticatedPeers()) this.trySend(record, "realtime", bytes);
  }

  private receive(
    record: PeerRecord,
    bytes: Uint8Array,
    channel: "reliable" | "realtime",
  ) {
    if (!this.peers.has(record.peer) || record.closing) return;
    const decoded = this.codec.decodeForChannel(bytes, channel);
    if (!decoded.ok) {
      this.strike(record, errorCodeForDecode(decoded.error.code), decoded.error.message);
      return;
    }
    this.handleMessage(record, decoded.value, channel);
  }

  private handleMessage(
    record: PeerRecord,
    message: GameNetMessage<Input, Snapshot, Event>,
    channel: "reliable" | "realtime",
  ) {
    if (record.playerId === null) {
      if (message.type !== "hello" || channel !== "reliable") {
        this.strike(record, ProtocolErrorCode.UnexpectedMessage, "HELLO must be the first message.");
        return;
      }
      this.admit(record, message);
      return;
    }

    switch (message.type) {
      case "input":
        if (message.sequence <= record.lastInputSequence) return;
        record.lastInputSequence = message.sequence;
        this.publishEvents(this.simulation.input(this.state, record.playerId, message.input));
        return;
      case "ping":
        this.trySend(record, "realtime", this.codec.encode({ type: "pong", requestId: message.requestId }));
        return;
      case "pong":
        return;
      case "disconnect":
        this.closePeer(record);
        return;
      default:
        this.strike(
          record,
          ProtocolErrorCode.UnexpectedMessage,
          `${message.type} is not valid from a client.`,
        );
    }
  }

  private admit(record: PeerRecord, hello: Extract<GameNetMessage<Input, Snapshot, Event>, { type: "hello" }>) {
    const result = negotiateHello(hello, {
      gameId: this.gameId,
      rulesetId: this.rulesetId,
      features: this.features,
      createPlayerId: () => this.createPlayerId(record.peer.peerId),
    });
    if (!result.ok) {
      this.sendReliable(record, result.error);
      this.closePeer(record);
      return;
    }
    if ([...this.peers.values()].some((other) => other.playerId === result.welcome.playerId)) {
      throw new Error(`Duplicate player ID: ${result.welcome.playerId}.`);
    }
    record.playerId = result.welcome.playerId;
    const events = this.simulation.addPlayer(this.state, record.playerId);
    this.sendReliable(record, result.welcome);
    this.publishEvents(events);
  }

  private strike(record: PeerRecord, code: number, diagnostic: string) {
    const now = this.now();
    record.strikes = record.strikes.filter((time) => time > now - STRIKE_WINDOW_MS);
    record.strikes.push(now);
    if (record.strikes.length < MAXIMUM_STRIKES) return;
    this.sendReliable(record, { type: "error", code, diagnostic });
    this.closePeer(record);
  }

  private publishEvents(events: readonly Event[] | void) {
    if (!events) return;
    for (const event of events) {
      const message: EventMessage<Event> = { type: "event", tick: this.tickNumber, event };
      const bytes = this.codec.encode(message);
      for (const record of this.authenticatedPeers()) this.trySend(record, "reliable", bytes);
    }
  }

  private sendReliable(record: PeerRecord, message: GameNetMessage<Input, Snapshot, Event>) {
    this.trySend(record, "reliable", this.codec.encode(message));
  }

  private trySend(record: PeerRecord, channel: "reliable" | "realtime", bytes: Uint8Array) {
    if (record.closing && channel === "realtime") return;
    try {
      if (channel === "reliable") record.peer.sendReliable(bytes);
      else record.peer.sendRealtime(bytes);
    } catch {
      this.closePeer(record);
    }
  }

  private closePeer(record: PeerRecord) {
    if (record.closing) return;
    record.closing = true;
    queueMicrotask(() => record.peer.close());
  }

  private removePeer(record: PeerRecord) {
    if (!this.peers.delete(record.peer)) return;
    if (record.playerId !== null) {
      this.publishEvents(this.simulation.removePlayer(this.state, record.playerId));
    }
  }

  private *authenticatedPeers() {
    for (const record of this.peers.values()) {
      if (record.playerId !== null && !record.closing) yield record;
    }
  }
}

function errorCodeForDecode(code: DecodeErrorCode) {
  if (code === "packet-too-large" || code === "limit-exceeded") {
    return ProtocolErrorCode.LimitExceeded;
  }
  if (code === "channel-mismatch") return ProtocolErrorCode.ChannelMismatch;
  if (code === "unsupported-message") return ProtocolErrorCode.UnsupportedMessage;
  return ProtocolErrorCode.MalformedMessage;
}
