export type PeerDataHandler = (data: Uint8Array) => void;
export type PeerCloseHandler = () => void;
export type PeerErrorHandler = (error: Error) => void;

export interface PeerConnection {
  readonly peerId: string;

  sendReliable(data: Uint8Array): void;
  sendRealtime(data: Uint8Array): void;

  onReliable(handler: PeerDataHandler): void;
  onRealtime(handler: PeerDataHandler): void;
  onClose(handler: PeerCloseHandler): void;
  onError(handler: PeerErrorHandler): void;

  close(): void;
}
