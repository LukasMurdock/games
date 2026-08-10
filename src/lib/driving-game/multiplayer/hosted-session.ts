import { DirectInviteCodec } from "../../../net/invite/codec";
import { createDirectUrl, decodeDirectFragment, encodeInviteFragment } from "../../../net/invite/fragment";
import { DirectResponseReceiver } from "../../../net/invite/handoff";
import { createDirectInvite, generateDirectSessionId } from "../../../net/invite/proof";
import { DirectInviteSlot } from "../../../net/invite/slot";
import { GameNetCodec } from "../../../net/protocol/codec";
import { HostRuntime } from "../../../net/runtime/host";
import { createMemoryPeerPair } from "../../../net/transport/memory";
import { WebRTCPeerConnection } from "../../../net/transport/webrtc";
import type { DrivingWorldQuery } from "../core/world-query";
import {
  CONFIGURABLE_DRIVING_RULESET_ID,
  configurableDrivingPayloadCodec,
} from "./configurable-protocol";
import { PRODUCTION_DRIVING_GAME_ID } from "./protocol";
import { PRODUCTION_DRIVING_COMPOSITION, createProductionDrivingConfig } from "./ruleset";
import {
  areAuthoritativeDrivingPlayersReady,
  authoritativeDrivingSimulation,
  reconfigureAuthoritativeDriving,
  setAuthoritativeDrivingPaused,
  type AuthoritativeDrivingConfig,
  type AuthoritativeDrivingEvent,
  type AuthoritativeDrivingInput,
  type AuthoritativeDrivingSnapshot,
  type AuthoritativeDrivingState,
} from "./simulation";
import { NetworkDrivingSession } from "./network-session";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
const directCodec = new DirectInviteCodec();

export type HostedDrivingSlot = {
  id: number;
  name: string;
  inviteUrl: string;
  status: "waiting" | "connecting" | "connected" | "closed" | "failed";
  close(): void;
};

export class HostedDrivingSession {
  private readonly host: HostRuntime<
    AuthoritativeDrivingConfig,
    AuthoritativeDrivingInput,
    AuthoritativeDrivingState,
    AuthoritativeDrivingSnapshot,
    AuthoritativeDrivingEvent
  >;
  private readonly local: NetworkDrivingSession;
  private readonly sessionId = generateDirectSessionId();
  private readonly receiver: DirectResponseReceiver;
  private readonly slots = new Map<number, HostedDrivingSlot & {
    peer: WebRTCPeerConnection;
    inviteState: DirectInviteSlot;
  }>();
  private readonly slotHandlers = new Set<(slots: readonly HostedDrivingSlot[]) => void>();
  private nextSlot = 1;
  private lastClock = performance.now();
  private sessionPaused = false;
  private disposeSimulationWorld: () => void;

  constructor(
    world: DrivingWorldQuery,
    private readonly inviteBaseUrl: string,
    disposeSimulationWorld: () => void = () => undefined,
  ) {
    this.disposeSimulationWorld = disposeSimulationWorld;
    let nextGuest = 1;
    this.host = new HostRuntime({
      simulation: authoritativeDrivingSimulation,
      simulationConfig: createProductionDrivingConfig(world),
      codec: new GameNetCodec(configurableDrivingPayloadCodec),
      gameId: PRODUCTION_DRIVING_GAME_ID,
      rulesetId: CONFIGURABLE_DRIVING_RULESET_ID,
      tickRate: PRODUCTION_DRIVING_COMPOSITION.tickRate,
      snapshotRate: PRODUCTION_DRIVING_COMPOSITION.snapshotRate,
      createPlayerId: (peerId) => peerId === "local-player" ? "host" : `guest-${nextGuest++}`,
    });
    const [hostPeer, clientPeer] = createMemoryPeerPair("local-player", "host-runtime");
    this.host.attach(hostPeer);
    this.local = new NetworkDrivingSession({ peer: clientPeer });
    this.local.start();
    this.receiver = new DirectResponseReceiver(this.sessionId, async (fragment) => {
      const decoded = decodeDirectFragment(fragment, directCodec);
      if (!decoded.ok || decoded.value.message.type !== "response") {
        return { accepted: false, message: "Response link is malformed." };
      }
      const response = decoded.value.message;
      const slot = this.slots.get(response.peerSlot);
      if (!slot) return { accepted: false, message: "This host has no matching open slot." };
      const consumed = await slot.inviteState.consume(response);
      if (!consumed.ok) return { accepted: false, message: `Response was ${consumed.reason}.` };
      try {
        slot.status = "connecting";
        this.emitSlots();
        await slot.peer.acceptAnswer({ type: "answer", sdp: consumed.answerSdp });
        return { accepted: true, message: `${slot.name || `Invite ${slot.id}`} accepted.` };
      } catch {
        slot.status = "failed";
        slot.peer.close();
        this.emitSlots();
        return { accepted: false, message: "WebRTC rejected this response." };
      }
    });
  }

  get playerId() { return this.local.playerId; }
  get state() { return this.local.state; }
  get playerCount() { return this.host.playerCount; }
  get paused() { return this.sessionPaused; }
  get canResume() {
    return this.host.control((state) => !state.awaitingReadiness || areAuthoritativeDrivingPlayersReady(state));
  }

  setPaused(paused: boolean) {
    this.host.control((state) => setAuthoritativeDrivingPaused(state, paused));
    this.sessionPaused = paused;
    this.lastClock = performance.now();
  }

  reconfigure(
    config: AuthoritativeDrivingConfig,
    disposeSimulationWorld: () => void = () => undefined,
  ) {
    const event = this.host.control((state) => reconfigureAuthoritativeDriving(state, config));
    const disposePreviousWorld = this.disposeSimulationWorld;
    this.disposeSimulationWorld = disposeSimulationWorld;
    disposePreviousWorld();
    this.host.publishHostEvent(event);
    this.sessionPaused = true;
    this.lastClock = performance.now();
  }

  update(now: number) {
    const elapsed = Math.min(0.1, Math.max(0, (now - this.lastClock) / 1000));
    this.lastClock = now;
    this.host.advance(elapsed);
    return this.local.sample(now);
  }

  sendInput(input: AuthoritativeDrivingInput) {
    if (this.local.state === "connected") this.local.sendInput(input);
  }

  onEvent(handler: (event: AuthoritativeDrivingEvent) => void) {
    this.local.onEvent(handler);
  }

  onSlots(handler: (slots: readonly HostedDrivingSlot[]) => void) {
    this.slotHandlers.add(handler);
    handler([...this.slots.values()]);
  }

  async createInvite(name = ""): Promise<HostedDrivingSlot> {
    const activeSlots = [...this.slots.values()].filter(
      (slot) => slot.status !== "closed" && slot.status !== "failed",
    ).length;
    if (activeSlots >= 7) throw new Error("The eight-player limit is reached.");
    const id = this.nextSlot++;
    const peer = new WebRTCPeerConnection({
      peerId: `direct-client-${id}`,
      role: "host",
      iceServers: ICE_SERVERS,
    });
    this.host.attach(peer);
    peer.onReliable(() => this.pumpTrafficClock());
    peer.onRealtime(() => this.pumpTrafficClock());
    let offer: RTCSessionDescriptionInit;
    try {
      offer = await peer.createOffer();
      if (!offer.sdp) throw new Error("WebRTC produced an empty offer SDP.");
    } catch (error) {
      peer.close();
      throw error;
    }
    const invite = createDirectInvite({
      sessionId: this.sessionId,
      peerSlot: id,
      offerSdp: offer.sdp,
      expiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
    });
    const inviteUrl = createDirectUrl(this.inviteBaseUrl, encodeInviteFragment(invite, directCodec));
    const slot: HostedDrivingSlot & { peer: WebRTCPeerConnection; inviteState: DirectInviteSlot } = {
      id,
      name: name.trim().slice(0, 40),
      inviteUrl,
      status: "waiting",
      peer,
      inviteState: new DirectInviteSlot(invite),
      close: () => peer.close(),
    };
    this.slots.set(id, slot);
    peer.onStatus((status) => {
      if (!this.slots.has(id)) return;
      if (status.connection === "connected") slot.status = "connected";
      else if (status.connection === "failed") slot.status = "failed";
      this.emitSlots();
    });
    peer.onClose(() => {
      slot.status = "closed";
      this.emitSlots();
    });
    this.emitSlots();
    return slot;
  }

  close() {
    this.receiver.close();
    this.local.close();
    this.host.close();
    for (const slot of this.slots.values()) slot.peer.close();
    this.disposeSimulationWorld();
    this.disposeSimulationWorld = () => undefined;
  }

  private pumpTrafficClock() {
    this.update(performance.now());
  }

  private emitSlots() {
    const slots = [...this.slots.values()];
    for (const handler of this.slotHandlers) handler(slots);
  }
}
