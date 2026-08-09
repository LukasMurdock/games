import type {
  PeerCloseHandler,
  PeerConnection,
  PeerDataHandler,
  PeerErrorHandler,
} from "./peer";

export type WebRTCPeerRole = "host" | "client";
export type WebRTCChannelState = RTCDataChannelState | "missing";

export type WebRTCPeerStatus = {
  connection: RTCPeerConnectionState;
  iceConnection: RTCIceConnectionState;
  iceGathering: RTCIceGatheringState;
  reliable: WebRTCChannelState;
  realtime: WebRTCChannelState;
};

export type WebRTCPeerConnectionOptions = {
  peerId: string;
  role: WebRTCPeerRole;
  iceServers?: RTCIceServer[];
  iceGatheringTimeoutMs?: number;
};

const DEFAULT_ICE_GATHERING_TIMEOUT_MS = 15_000;

type ChannelKind = "reliable" | "realtime";
type StatusHandler = (status: WebRTCPeerStatus) => void;

export class WebRTCPeerConnection implements PeerConnection {
  readonly peerId: string;

  private readonly connection: RTCPeerConnection;
  private readonly gatheringTimeoutMs: number;
  private readonly reliableHandlers = new Set<PeerDataHandler>();
  private readonly realtimeHandlers = new Set<PeerDataHandler>();
  private readonly closeHandlers = new Set<PeerCloseHandler>();
  private readonly errorHandlers = new Set<PeerErrorHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();
  private reliableChannel: RTCDataChannel | null = null;
  private realtimeChannel: RTCDataChannel | null = null;
  private closed = false;
  private closeEmitted = false;
  private hadOpenChannel = false;

  constructor(options: WebRTCPeerConnectionOptions) {
    this.peerId = options.peerId;
    this.gatheringTimeoutMs = options.iceGatheringTimeoutMs
      ?? DEFAULT_ICE_GATHERING_TIMEOUT_MS;
    this.connection = new RTCPeerConnection({ iceServers: options.iceServers ?? [] });
    this.listenToConnection();

    if (options.role === "host") {
      this.attachChannel(
        this.connection.createDataChannel("reliable", { ordered: true }),
        "reliable",
      );
      this.attachChannel(
        this.connection.createDataChannel("realtime", { ordered: false, maxRetransmits: 0 }),
        "realtime",
      );
    }
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.assertActive();
    if (!this.reliableChannel || !this.realtimeChannel) {
      throw new Error("Only a host peer can create an offer.");
    }
    const offer = await this.connection.createOffer();
    await this.connection.setLocalDescription(offer);
    await this.waitForIceGathering();
    return this.requireLocalDescription("offer");
  }

  async acceptOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    this.assertActive();
    if (this.reliableChannel || this.realtimeChannel) {
      throw new Error("A host peer cannot accept another host's offer.");
    }
    await this.connection.setRemoteDescription(offer);
    const answer = await this.connection.createAnswer();
    await this.connection.setLocalDescription(answer);
    await this.waitForIceGathering();
    return this.requireLocalDescription("answer");
  }

  async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    this.assertActive();
    if (this.connection.signalingState !== "have-local-offer") {
      throw new Error("Create an offer before accepting an answer.");
    }
    await this.connection.setRemoteDescription(answer);
  }

  sendReliable(data: Uint8Array): void {
    this.send(this.reliableChannel, data, "reliable");
  }

  sendRealtime(data: Uint8Array): void {
    this.send(this.realtimeChannel, data, "realtime");
  }

  onReliable(handler: PeerDataHandler): void {
    this.reliableHandlers.add(handler);
  }

  onRealtime(handler: PeerDataHandler): void {
    this.realtimeHandlers.add(handler);
  }

  onClose(handler: PeerCloseHandler): void {
    this.closeHandlers.add(handler);
    if (this.closeEmitted) handler();
  }

  onError(handler: PeerErrorHandler): void {
    this.errorHandlers.add(handler);
  }

  onStatus(handler: StatusHandler): void {
    this.statusHandlers.add(handler);
    handler(this.status);
  }

  get status(): WebRTCPeerStatus {
    return {
      connection: this.connection.connectionState,
      iceConnection: this.connection.iceConnectionState,
      iceGathering: this.connection.iceGatheringState,
      reliable: this.reliableChannel?.readyState ?? "missing",
      realtime: this.realtimeChannel?.readyState ?? "missing",
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.reliableChannel?.close();
    this.realtimeChannel?.close();
    this.connection.close();
    this.emitStatus();
    this.emitClose();
  }

  private listenToConnection() {
    this.connection.addEventListener("datachannel", (event) => {
      if (event.channel.label === "reliable" || event.channel.label === "realtime") {
        this.attachChannel(event.channel, event.channel.label);
        return;
      }
      event.channel.close();
      this.emitError(new Error(`Rejected unknown DataChannel: ${event.channel.label}.`));
    });
    this.connection.addEventListener("connectionstatechange", () => {
      this.emitStatus();
      if (this.connection.connectionState === "failed") {
        this.emitError(new Error("WebRTC peer connection failed."));
        this.emitClose();
      } else if (this.connection.connectionState === "closed") {
        this.emitClose();
      }
    });
    this.connection.addEventListener("iceconnectionstatechange", () => this.emitStatus());
    this.connection.addEventListener("icegatheringstatechange", () => this.emitStatus());
  }

  private attachChannel(channel: RTCDataChannel, kind: ChannelKind) {
    const current = kind === "reliable" ? this.reliableChannel : this.realtimeChannel;
    if (current) {
      channel.close();
      this.emitError(new Error(`Rejected duplicate ${kind} DataChannel.`));
      return;
    }
    if (!this.hasExpectedConfiguration(channel, kind)) {
      channel.close();
      this.emitError(new Error(`${kind} DataChannel has invalid delivery settings.`));
      return;
    }
    if (kind === "reliable") this.reliableChannel = channel;
    else this.realtimeChannel = channel;
    channel.binaryType = "arraybuffer";
    channel.addEventListener("open", () => {
      this.hadOpenChannel = true;
      this.emitStatus();
    });
    channel.addEventListener("close", () => {
      this.emitStatus();
      if (
        this.hadOpenChannel
        && this.reliableChannel?.readyState === "closed"
        && this.realtimeChannel?.readyState === "closed"
      ) this.emitClose();
    });
    channel.addEventListener("error", () => {
      this.emitError(new Error(`${kind} DataChannel failed.`));
      this.emitStatus();
    });
    channel.addEventListener("message", (event) => this.receive(kind, event.data));
    this.emitStatus();
  }

  private hasExpectedConfiguration(channel: RTCDataChannel, kind: ChannelKind) {
    if (kind === "reliable") {
      return channel.ordered
        && channel.maxRetransmits === null
        && channel.maxPacketLifeTime === null;
    }
    return !channel.ordered && channel.maxRetransmits === 0;
  }

  private receive(kind: ChannelKind, value: unknown) {
    if (!(value instanceof ArrayBuffer)) {
      this.emitError(new Error(`${kind} DataChannel received a non-binary payload.`));
      return;
    }
    const bytes = new Uint8Array(value);
    const handlers = kind === "reliable" ? this.reliableHandlers : this.realtimeHandlers;
    for (const handler of handlers) handler(bytes);
  }

  private send(channel: RTCDataChannel | null, data: Uint8Array, kind: ChannelKind) {
    this.assertActive();
    if (!channel || channel.readyState !== "open") {
      throw new Error(`${kind} DataChannel is not open.`);
    }
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(data);
    channel.send(bytes);
  }

  private assertActive() {
    if (this.closed) throw new Error("Peer connection is closed.");
  }

  private waitForIceGathering() {
    if (this.connection.iceGatheringState === "complete") return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("ICE gathering timed out."));
      }, this.gatheringTimeoutMs);
      const onStateChange = () => {
        if (this.connection.iceGatheringState !== "complete") return;
        cleanup();
        resolve();
      };
      const cleanup = () => {
        window.clearTimeout(timeout);
        this.connection.removeEventListener("icegatheringstatechange", onStateChange);
      };
      this.connection.addEventListener("icegatheringstatechange", onStateChange);
    });
  }

  private requireLocalDescription(expectedType: RTCSdpType): RTCSessionDescriptionInit {
    const description = this.connection.localDescription;
    if (!description || description.type !== expectedType) {
      throw new Error(`WebRTC did not produce a complete ${expectedType}.`);
    }
    return { type: description.type, sdp: description.sdp };
  }

  private emitStatus() {
    const status = this.status;
    for (const handler of this.statusHandlers) handler(status);
  }

  private emitError(error: Error) {
    for (const handler of this.errorHandlers) handler(error);
  }

  private emitClose() {
    if (this.closeEmitted) return;
    this.closeEmitted = true;
    for (const handler of this.closeHandlers) handler();
  }
}
