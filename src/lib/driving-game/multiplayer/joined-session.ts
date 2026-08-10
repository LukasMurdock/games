import { DirectInviteCodec } from "../../../net/invite/codec";
import { createDirectUrl, encodeResponseFragment } from "../../../net/invite/fragment";
import { createDirectResponse } from "../../../net/invite/proof";
import type { DirectInvite } from "../../../net/invite/types";
import { WebRTCPeerConnection } from "../../../net/transport/webrtc";
import type { AuthoritativeDrivingEvent, AuthoritativeDrivingInput } from "./simulation";
import { NetworkDrivingSession } from "./network-session";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
const directCodec = new DirectInviteCodec();

export class JoinedDrivingSession {
  readonly peer: WebRTCPeerConnection;
  readonly responseUrl: string;
  private network: NetworkDrivingSession | null = null;
  private transportClosed = false;
  private readonly eventHandlers = new Set<(event: AuthoritativeDrivingEvent) => void>();

  private constructor(peer: WebRTCPeerConnection, responseUrl: string) {
    this.peer = peer;
    this.responseUrl = responseUrl;
    peer.onClose(() => { this.transportClosed = true; });
    peer.onStatus((status) => {
      if (status.connection === "failed" || status.connection === "closed") {
        this.transportClosed = true;
      }
      if (
        status.reliable === "open"
        && status.realtime === "open"
        && this.network === null
      ) {
        this.network = new NetworkDrivingSession({ peer });
        this.network.onEvent((event) => {
          for (const handler of this.eventHandlers) handler(event);
        });
        this.network.start();
      }
    });
  }

  static async create(invite: DirectInvite, responseBaseUrl: string) {
    if (invite.expiresAt !== undefined && Date.now() / 1000 >= invite.expiresAt) {
      throw new Error("This Direct Invite has expired.");
    }
    const peer = new WebRTCPeerConnection({
      peerId: "direct-host",
      role: "client",
      iceServers: ICE_SERVERS,
    });
    const answer = await peer.acceptOffer({ type: "offer", sdp: invite.offerSdp });
    if (!answer.sdp) throw new Error("WebRTC produced an empty answer SDP.");
    const response = await createDirectResponse(invite, answer.sdp);
    const responseUrl = createDirectUrl(
      responseBaseUrl,
      encodeResponseFragment(response, directCodec),
    );
    return new JoinedDrivingSession(peer, responseUrl);
  }

  get playerId() { return this.network?.playerId ?? null; }
  get diagnostics() { return this.network?.diagnostics ?? null; }
  get state() { return this.transportClosed ? "closed" : this.network?.state ?? "negotiating"; }

  update(now: number) {
    return this.network?.sample(now) ?? null;
  }

  sendInput(input: AuthoritativeDrivingInput) {
    if (this.network?.state === "connected") this.network.sendInput(input);
  }

  onEvent(handler: (event: AuthoritativeDrivingEvent) => void) {
    this.eventHandlers.add(handler);
  }

  close() {
    if (this.network) this.network.close();
    else this.peer.close();
  }
}
