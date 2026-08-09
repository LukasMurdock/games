import type {
  PeerCloseHandler,
  PeerConnection,
  PeerDataHandler,
  PeerErrorHandler,
} from "./peer";

type DeliveryKind = "reliable" | "realtime";

export function createMemoryPeerPair(
  leftPeerId = "left",
  rightPeerId = "right",
): readonly [PeerConnection, PeerConnection] {
  const left = new MemoryPeerConnection(leftPeerId);
  const right = new MemoryPeerConnection(rightPeerId);
  left.connect(right);
  right.connect(left);
  return [left, right];
}

class MemoryPeerConnection implements PeerConnection {
  readonly peerId: string;

  private remote: MemoryPeerConnection | null = null;
  private readonly reliableHandlers = new Set<PeerDataHandler>();
  private readonly realtimeHandlers = new Set<PeerDataHandler>();
  private readonly closeHandlers = new Set<PeerCloseHandler>();
  private closed = false;

  constructor(peerId: string) {
    this.peerId = peerId;
  }

  connect(remote: MemoryPeerConnection) {
    this.remote = remote;
  }

  sendReliable(data: Uint8Array): void {
    this.send("reliable", data);
  }

  sendRealtime(data: Uint8Array): void {
    this.send("realtime", data);
  }

  onReliable(handler: PeerDataHandler): void {
    this.reliableHandlers.add(handler);
  }

  onRealtime(handler: PeerDataHandler): void {
    this.realtimeHandlers.add(handler);
  }

  onClose(handler: PeerCloseHandler): void {
    this.closeHandlers.add(handler);
    if (this.closed) handler();
  }

  onError(_handler: PeerErrorHandler): void {
    // Synchronous in-memory delivery has no asynchronous transport errors.
  }

  close(): void {
    if (this.closed) return;
    this.finishClose();
    this.remote?.finishClose();
  }

  private send(kind: DeliveryKind, data: Uint8Array) {
    if (this.closed) throw new Error("Peer connection is closed.");
    const remote = this.remote;
    if (!remote || remote.closed) throw new Error("Remote peer connection is closed.");
    const copy = data.slice();
    queueMicrotask(() => remote.deliver(kind, copy));
  }

  private deliver(kind: DeliveryKind, data: Uint8Array) {
    if (this.closed) return;
    const handlers = kind === "reliable" ? this.reliableHandlers : this.realtimeHandlers;
    for (const handler of handlers) handler(data);
  }

  private finishClose() {
    if (this.closed) return;
    this.closed = true;
    for (const handler of this.closeHandlers) handler();
  }
}
