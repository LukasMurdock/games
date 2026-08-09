import "./styles/network-test.css";
import { movingCirclesPayloadCodec } from "./conformance/moving-circles/protocol";
import {
  movingCirclesSimulation,
  type MovingCirclesConfig,
  type MovingCirclesEvent,
  type MovingCirclesInput,
  type MovingCirclesSnapshot,
  type MovingCirclesState,
} from "./conformance/moving-circles/simulation";
import { DirectInviteCodec } from "./net/invite/codec";
import {
  createDirectUrl,
  decodeDirectFragment,
  encodeInviteFragment,
  encodeResponseFragment,
} from "./net/invite/fragment";
import {
  DirectResponseReceiver,
  handoffDirectResponse,
} from "./net/invite/handoff";
import {
  createDirectInvite,
  createDirectResponse,
  generateDirectSessionId,
} from "./net/invite/proof";
import { DirectInviteSlot } from "./net/invite/slot";
import type { DirectInvite, DirectResponse } from "./net/invite/types";
import { GameNetCodec } from "./net/protocol/codec";
import { ClientRuntime } from "./net/runtime/client";
import { HostRuntime } from "./net/runtime/host";
import { createMemoryPeerPair } from "./net/transport/memory";
import type { PeerConnection } from "./net/transport/peer";
import {
  WebRTCPeerConnection,
  type WebRTCPeerRole,
  type WebRTCPeerStatus,
} from "./net/transport/webrtc";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
];
const GAME_ID = "moving-circles";
const RULESET_ID = Uint8Array.from([
  0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
  0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
]);
const WORLD_RADIUS = 100;
const INPUT_INTERVAL_MS = 1000 / 30;
const gameCodec = new GameNetCodec(movingCirclesPayloadCodec);
const directCodec = new DirectInviteCodec();

type CircleClientRuntime = ClientRuntime<
  MovingCirclesInput,
  MovingCirclesSnapshot,
  MovingCirclesEvent
>;
type CircleHostRuntime = HostRuntime<
  MovingCirclesConfig,
  MovingCirclesInput,
  MovingCirclesState,
  MovingCirclesSnapshot,
  MovingCirclesEvent
>;

const element = <T extends HTMLElement>(selector: string) => {
  const match = document.querySelector<T>(selector);
  if (!match) throw new Error(`Missing network test element: ${selector}`);
  return match;
};

const connectionStatus = element<HTMLElement>("#connection-status");
const roleStatus = element<HTMLElement>("#role-status");
const iceStatus = element<HTMLElement>("#ice-status");
const reliableStatus = element<HTMLElement>("#reliable-status");
const realtimeStatus = element<HTMLElement>("#realtime-status");
const gameSessionStatus = element<HTMLElement>("#game-session-status");
const playerIdStatus = element<HTMLElement>("#player-id-status");
const tickStatus = element<HTMLElement>("#tick-status");
const playerCountStatus = element<HTMLElement>("#player-count-status");
const closeButton = element<HTMLButtonElement>("#close-connection");
const createOfferButton = element<HTMLButtonElement>("#create-offer");
const inviteNameInput = element<HTMLInputElement>("#invite-name");
const hostSlotsRoot = element<HTMLElement>("#host-slots");
const directActionTitle = element<HTMLElement>("#direct-action-title");
const directActionStatus = element<HTMLElement>("#direct-action-status");
const directActionLink = element<HTMLOutputElement>("#direct-action-link");
const copyDirectActionButton = element<HTMLButtonElement>("#copy-direct-action");
const eventLog = element<HTMLOListElement>("#event-log");
const arena = element<HTMLCanvasElement>("#circle-arena");
const arenaEmpty = element<HTMLElement>("#arena-empty");
const arenaContext = getCanvasContext(arena);

function getCanvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Moving-circles requires Canvas 2D.");
  return context;
}

type HostSlot = {
  id: number;
  name: string;
  connection: WebRTCPeerConnection;
  inviteState: DirectInviteSlot;
  root: HTMLElement;
  status: HTMLElement;
  inviteLink: HTMLElement;
  copyButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
};

let clientPeer: WebRTCPeerConnection | null = null;
let role: WebRTCPeerRole | null = null;
const hostSlots = new Map<number, HostSlot>();
let nextHostSlotId = 1;
let hostRuntime: CircleHostRuntime | null = null;
let localClient: CircleClientRuntime | null = null;
let hostSessionId: Uint8Array | null = null;
let responseReceiver: DirectResponseReceiver | null = null;
let latestSnapshot: MovingCirclesSnapshot = { players: [] };
let latestTick = 0;
let startedAt = performance.now();
let lastHostClock = performance.now();
let lastInputSentAt = Number.NEGATIVE_INFINITY;
let lastInputSignature = "";
const pressedDirections = new Set<string>();

function log(message: string, className = "") {
  const item = document.createElement("li");
  const elapsed = ((performance.now() - startedAt) / 1000).toFixed(3);
  item.textContent = `${elapsed}s  ${message}`;
  item.className = className;
  eventLog.append(item);
  eventLog.scrollTop = eventLog.scrollHeight;
}

function setConnectionStatus(value: string, state = value.toLowerCase()) {
  connectionStatus.textContent = value;
  connectionStatus.dataset.state = state;
}

function displayChannelState(state: WebRTCPeerStatus["reliable"]) {
  return state === "missing" ? "closed" : state;
}

function applyStatus(status: WebRTCPeerStatus) {
  iceStatus.textContent = status.iceConnection;
  reliableStatus.textContent = displayChannelState(status.reliable);
  realtimeStatus.textContent = displayChannelState(status.realtime);
  if (status.connection === "connected") setConnectionStatus("Connected", "connected");
  else if (status.connection === "failed") setConnectionStatus("Failed", "failed");
  else if (status.connection === "connecting") setConnectionStatus("Connecting");
}

function resetGamePresentation(message = "Create a host offer or connect as a client to start.") {
  latestSnapshot = { players: [] };
  latestTick = 0;
  lastInputSentAt = Number.NEGATIVE_INFINITY;
  lastInputSignature = "";
  pressedDirections.clear();
  gameSessionStatus.textContent = "idle";
  playerIdStatus.textContent = "—";
  tickStatus.textContent = "0";
  playerCountStatus.textContent = "0";
  arenaEmpty.textContent = message;
  arenaEmpty.hidden = false;
}

function closeCurrent(reason: string, writeLog = true, immediate = false) {
  const closingClientPeer = clientPeer;
  const closingHostPeers = [...hostSlots.values()].map((slot) => slot.connection);
  const closingHost = hostRuntime;
  const closingClient = localClient;
  clientPeer = null;
  hostRuntime = null;
  localClient = null;
  hostSessionId = null;
  responseReceiver?.close();
  responseReceiver = null;
  role = null;
  hostSlots.clear();
  hostSlotsRoot.replaceChildren();
  if (closingHost) closingHost.close();
  else closingClient?.close();
  const closingPeers = [closingClientPeer, ...closingHostPeers].filter(
    (connection): connection is WebRTCPeerConnection => connection !== null,
  );
  for (const connection of closingPeers) {
    if (immediate) connection.close();
    else queueMicrotask(() => connection.close());
  }
  roleStatus.textContent = "—";
  iceStatus.textContent = "closed";
  reliableStatus.textContent = "closed";
  realtimeStatus.textContent = "closed";
  closeButton.disabled = true;
  createOfferButton.disabled = false;
  setConnectionStatus("Closed");
  resetGamePresentation("Session closed.");
  if (writeLog && (closingPeers.length || closingHost || closingClient)) {
    log(`Session closed (${reason}).`);
  }
}

function createClientPeer() {
  closeCurrent("replaced", false, true);
  const connection = new WebRTCPeerConnection({
    peerId: "manual-host",
    role: "client",
    iceServers: ICE_SERVERS,
  });
  clientPeer = connection;
  role = "client";
  startedAt = performance.now();
  roleStatus.textContent = "client";
  closeButton.disabled = false;
  setConnectionStatus("Preparing");
  log("Created client WebRTCPeerConnection.");

  let previousStatus: WebRTCPeerStatus | null = null;
  connection.onStatus((status) => {
    if (clientPeer !== connection) return;
    applyStatus(status);
    if (previousStatus?.connection !== status.connection) {
      log(`Connection state: ${status.connection}.`, status.connection === "failed" ? "error" : "");
    }
    if (previousStatus?.iceConnection !== status.iceConnection) {
      log(`ICE state: ${status.iceConnection}.`);
    }
    if (previousStatus?.iceGathering !== status.iceGathering) {
      log(`ICE gathering: ${status.iceGathering}.`);
    }
    if (previousStatus?.reliable !== "open" && status.reliable === "open") {
      log("Reliable channel open (ordered, retransmitted).");
    }
    if (previousStatus?.realtime !== "open" && status.realtime === "open") {
      log("Realtime channel open (unordered, max retransmits 0).");
    }
    previousStatus = status;
    if (
      status.reliable === "open"
      && status.realtime === "open"
      && localClient === null
    ) startRemoteClientSession(connection);
  });
  connection.onError((error) => log(error.message, "error"));
  connection.onClose(() => {
    if (clientPeer !== connection) return;
    clientPeer = null;
    reliableStatus.textContent = "closed";
    realtimeStatus.textContent = "closed";
    iceStatus.textContent = "closed";
    setConnectionStatus("Closed");
    closeButton.disabled = true;
    arenaEmpty.textContent = "Host connection ended.";
    arenaEmpty.hidden = latestSnapshot.players.length > 0;
    log("Host WebRTC connection closed.");
  });
  return connection;
}

function startHostSession() {
  if (role !== "host") {
    closeCurrent("replaced", false, true);
    role = "host";
    roleStatus.textContent = "host";
    startedAt = performance.now();
  }
  if (hostRuntime) return hostRuntime;
  let nextGuest = 1;
  const runtime = new HostRuntime({
    simulation: movingCirclesSimulation,
    simulationConfig: { speed: 24, worldRadius: WORLD_RADIUS },
    codec: gameCodec,
    gameId: GAME_ID,
    rulesetId: RULESET_ID,
    createPlayerId: (peerId) => peerId === "local-player" ? "host" : `guest-${nextGuest++}`,
  });
  hostRuntime = runtime;
  hostSessionId = generateDirectSessionId();
  responseReceiver = new DirectResponseReceiver(hostSessionId, consumeResponseFragment);
  const [loopbackHost, loopbackClient] = createMemoryPeerPair("local-player", "host-runtime");
  runtime.attach(loopbackHost);
  lastHostClock = performance.now();
  const client = createGameClient(loopbackClient);
  localClient = client;
  bindGameClient(client);
  client.start();
  closeButton.disabled = false;
  gameSessionStatus.textContent = "negotiating";
  updateHostTransportStatus();
  log("Started authoritative host simulation with a loopback local client.");
  return runtime;
}

function createHostSlotElements(
  id: number,
  name: string,
  connection: WebRTCPeerConnection,
  inviteState: DirectInviteSlot,
  inviteUrl: string,
): HostSlot {
  const root = document.createElement("section");
  root.className = "host-slot";
  const heading = document.createElement("div");
  heading.className = "host-slot__heading";
  const title = document.createElement("strong");
  title.textContent = name || `Invite ${id}`;
  const status = document.createElement("span");
  status.className = "host-slot__status";
  status.textContent = "waiting for response";
  heading.append(title, status);

  const inviteLink = document.createElement("output");
  inviteLink.className = "host-slot__invite";
  inviteLink.dataset.url = inviteUrl;
  inviteLink.textContent = inviteUrl;
  const actions = document.createElement("div");
  actions.className = "host-slot__actions";
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "secondary";
  copyButton.textContent = "Copy invite";
  const closeSlotButton = document.createElement("button");
  closeSlotButton.type = "button";
  closeSlotButton.className = "secondary";
  closeSlotButton.textContent = "Close slot";
  actions.append(copyButton, closeSlotButton);
  root.append(heading, inviteLink, actions);
  hostSlotsRoot.append(root);

  return {
    id,
    name,
    connection,
    inviteState,
    root,
    status,
    inviteLink,
    copyButton,
    closeButton: closeSlotButton,
  };
}

async function createHostSlot() {
  if (role === "host" && hostSlots.size >= 7) {
    throw new Error("The eight-player conformance limit is already reached.");
  }
  const runtime = startHostSession();
  if (!hostSessionId) throw new Error("Host session ID is unavailable.");
  const id = nextHostSlotId++;
  const name = inviteNameInput.value.trim().slice(0, 40);
  inviteNameInput.value = "";
  const connection = new WebRTCPeerConnection({
    peerId: `direct-client-${id}`,
    role: "host",
    iceServers: ICE_SERVERS,
  });
  runtime.attach(connection);
  connection.onReliable(() => pumpHostClock(performance.now()));
  connection.onRealtime(() => pumpHostClock(performance.now()));

  let offer: RTCSessionDescriptionInit;
  try {
    offer = await connection.createOffer();
  } catch (error) {
    connection.close();
    throw error;
  }
  if (!offer.sdp) {
    connection.close();
    throw new Error("WebRTC produced an empty offer SDP.");
  }
  const invite = createDirectInvite({
    sessionId: hostSessionId,
    peerSlot: id,
    offerSdp: offer.sdp,
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
  });
  // Encoding validates all capability and SDP bounds before the slot is shown.
  const inviteUrl = createDirectUrl(baseGameUrl(), encodeInviteFragment(invite, directCodec));
  const inviteState = new DirectInviteSlot(invite);
  const slot = createHostSlotElements(id, name, connection, inviteState, inviteUrl);
  hostSlots.set(id, slot);

  let previousConnectionState: RTCPeerConnectionState | null = null;
  connection.onStatus((statusValue) => {
    if (hostSlots.get(id)?.connection !== connection) return;
    if (statusValue.connection === "connected") slot.status.textContent = "connected";
    else if (slot.inviteState.consumed) slot.status.textContent = "connecting";
    if (previousConnectionState !== statusValue.connection) {
      log(
        `${slotLabel(slot)} connection state: ${statusValue.connection}.`,
        statusValue.connection === "failed" ? "error" : "",
      );
      previousConnectionState = statusValue.connection;
    }
    updateHostTransportStatus();
  });
  connection.onError((error) => log(`${slotLabel(slot)}: ${error.message}`, "error"));
  connection.onClose(() => {
    if (hostSlots.get(id)?.connection !== connection) return;
    hostSlots.delete(id);
    slot.status.textContent = "closed";
    slot.copyButton.disabled = true;
    slot.closeButton.disabled = true;
    updateHostTransportStatus();
    log(`${slotLabel(slot)} closed; host simulation continues.`);
  });
  slot.copyButton.addEventListener("click", () => void copyText(inviteUrl, `${slotLabel(slot)} invite`));
  slot.closeButton.addEventListener("click", () => connection.close());

  updateHostTransportStatus();
  log(`${slotLabel(slot)} invite is ready.`);
}

async function consumeResponseFragment(fragment: string) {
  const decoded = decodeDirectFragment(fragment, directCodec);
  if (!decoded.ok || decoded.value.message.type !== "response") {
    return { accepted: false, message: "Response link is malformed." };
  }
  const response = decoded.value.message;
  const slot = hostSlots.get(response.peerSlot);
  if (!slot) return { accepted: false, message: "This host has no matching open slot." };
  const consumed = await slot.inviteState.consume(response);
  if (!consumed.ok) {
    const messages = {
      consumed: "This response was already used. Return to the host game tab; create a new invite if the player is not connected.",
      expired: "This invite expired. Return to the host game tab and create a new invite.",
      "invalid-response": "This response does not match the invite slot.",
    } as const;
    return { accepted: false, message: messages[consumed.reason] };
  }
  try {
    await slot.connection.acceptAnswer({ type: "answer", sdp: consumed.answerSdp });
    slot.status.textContent = "connecting";
    slot.copyButton.disabled = true;
    delete slot.inviteLink.dataset.url;
    slot.inviteLink.textContent = "Response accepted";
    log(`${slotLabel(slot)} response accepted.`);
    return { accepted: true, message: `${slotLabel(slot)} response accepted.` };
  } catch {
    slot.status.textContent = "failed";
    slot.connection.close();
    return { accepted: false, message: "WebRTC rejected this response." };
  }
}

function slotLabel(slot: HostSlot) {
  return slot.name || `Client slot ${slot.id}`;
}

function updateHostTransportStatus() {
  if (role !== "host") return;
  const slots = [...hostSlots.values()];
  const connected = slots.filter((slot) => slot.connection.status.connection === "connected").length;
  const reliableOpen = slots.filter((slot) => slot.connection.status.reliable === "open").length;
  const realtimeOpen = slots.filter((slot) => slot.connection.status.realtime === "open").length;
  setConnectionStatus(
    slots.length === 0 ? "Host ready" : `${connected}/${slots.length} peers connected`,
    connected > 0 ? "connected" : "preparing",
  );
  iceStatus.textContent = `${connected}/${slots.length} connected`;
  reliableStatus.textContent = `${reliableOpen}/${slots.length} open`;
  realtimeStatus.textContent = `${realtimeOpen}/${slots.length} open`;
  createOfferButton.disabled = slots.length >= 7;
}

function startRemoteClientSession(connection: WebRTCPeerConnection) {
  const client = createGameClient(connection);
  localClient = client;
  bindGameClient(client);
  client.start();
  log("Sent GameNet HELLO to the host.");
}

function createGameClient(connection: PeerConnection) {
  return new ClientRuntime({
    peer: connection,
    codec: gameCodec,
    gameId: GAME_ID,
    rulesetId: RULESET_ID,
  });
}

function bindGameClient(client: CircleClientRuntime) {
  client.onState((state) => {
    if (localClient !== client) return;
    gameSessionStatus.textContent = state;
    if (state === "connected") {
      playerIdStatus.textContent = client.playerId ?? "—";
      arenaEmpty.textContent = "Waiting for the first authoritative snapshot…";
      arena.focus();
      log(`GameNet WELCOME assigned player ${client.playerId}.`);
    } else if (state === "closed") {
      arenaEmpty.textContent = "GameNet session ended.";
      arenaEmpty.hidden = latestSnapshot.players.length > 0;
    }
  });
  client.onSnapshot((message) => {
    if (localClient !== client) return;
    latestSnapshot = message.snapshot;
    latestTick = message.tick;
    arenaEmpty.hidden = latestSnapshot.players.length > 0;
  });
  client.onEvent((message) => {
    if (localClient !== client) return;
    log(`Game event at tick ${message.tick}: ${message.event.playerId} ${message.event.type}.`, "received");
  });
  client.onError((error) => {
    if (localClient === client) log(`GameNet ${error.kind}: ${error.message}`, "error");
  });
  client.onClose(() => {
    if (localClient === client) gameSessionStatus.textContent = "closed";
  });
}

async function handleDirectInvite(invite: DirectInvite) {
  if (invite.expiresAt !== undefined && Date.now() / 1000 >= invite.expiresAt) {
    throw new Error("This Direct Invite has expired.");
  }
  directActionTitle.textContent = "Ready to connect";
  directActionStatus.textContent = "Creating a private WebRTC response…";
  const connection = createClientPeer();
  setConnectionStatus("Gathering ICE");
  const answer = await connection.acceptOffer({ type: "offer", sdp: invite.offerSdp });
  if (clientPeer !== connection || !answer.sdp) throw new Error("Client connection was closed.");
  const response = await createDirectResponse(invite, answer.sdp);
  const responseUrl = createDirectUrl(baseGameUrl(), encodeResponseFragment(response, directCodec));
  showDirectActionLink(responseUrl, "Copy response");
  directActionStatus.textContent = "Send this response link back to the host.";
  setConnectionStatus("Awaiting host");
  log("Direct Response link is ready.");
}

async function handleDirectResponse(response: DirectResponse, fragment: string) {
  roleStatus.textContent = "response handoff";
  setConnectionStatus("Delivering");
  directActionTitle.textContent = "Delivering response";
  directActionStatus.textContent = "Looking for the already-running host tab…";
  const result = await handoffDirectResponse(response.sessionId, fragment);
  if (result.accepted) {
    setConnectionStatus("Delivered", "connected");
    directActionStatus.textContent = result.message ?? "Response delivered to the host tab.";
    directActionLink.hidden = true;
    copyDirectActionButton.hidden = true;
    setTimeout(() => window.close(), 250);
    return;
  }
  setConnectionStatus("Not delivered", "failed");
  const responseUrl = createDirectUrl(baseGameUrl(), fragment);
  showDirectActionLink(responseUrl, "Copy response");
  directActionStatus.textContent = result.message
    ?? "Open the matching host game tab, then reopen this response link.";
}

function showDirectActionLink(url: string, buttonText: string) {
  directActionLink.value = url;
  directActionLink.textContent = url;
  directActionLink.hidden = false;
  copyDirectActionButton.textContent = buttonText;
  copyDirectActionButton.hidden = false;
  copyDirectActionButton.onclick = () => void copyText(url, buttonText.toLowerCase());
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function runAction(button: HTMLButtonElement, action: () => Promise<void>) {
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    setConnectionStatus("Failed", "failed");
    log(errorMessage(error), "error");
  } finally {
    button.disabled = false;
  }
}

async function copyText(value: string, label: string) {
  await navigator.clipboard.writeText(value);
  log(`Copied ${label} to the clipboard.`);
}

function baseGameUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  return url.toString();
}

function currentDirection(): [number, number] {
  const x = Number(pressedDirections.has("right")) - Number(pressedDirections.has("left"));
  const y = Number(pressedDirections.has("down")) - Number(pressedDirections.has("up"));
  return [x, y];
}

function sendCurrentInput(now: number) {
  const client = localClient;
  if (!client || client.state !== "connected") return;
  const direction = currentDirection();
  const signature = direction.join(",");
  const directionChanged = signature !== lastInputSignature;
  if (!directionChanged && now - lastInputSentAt < INPUT_INTERVAL_MS) return;
  try {
    client.sendInput({ direction });
    lastInputSignature = signature;
    lastInputSentAt = now;
    if (directionChanged) log(`Sent input direction [${signature}].`);
  } catch (error) {
    log(errorMessage(error), "error");
  }
}

function setDirection(direction: string, pressed: boolean) {
  const changed = pressed
    ? !pressedDirections.has(direction)
    : pressedDirections.has(direction);
  if (!changed) return;
  if (pressed) pressedDirections.add(direction);
  else pressedDirections.delete(direction);
  document.querySelector(`[data-direction="${direction}"]`)?.classList.toggle("is-active", pressed);
  sendCurrentInput(performance.now());
}

function resizeArena() {
  const width = Math.max(arena.clientWidth, 1);
  const height = Math.max(arena.clientHeight, 1);
  const ratio = Math.min(window.devicePixelRatio, 2);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (arena.width !== pixelWidth || arena.height !== pixelHeight) {
    arena.width = pixelWidth;
    arena.height = pixelHeight;
  }
  arenaContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width, height };
}

function renderArena() {
  const { width, height } = resizeArena();
  arenaContext.clearRect(0, 0, width, height);
  arenaContext.fillStyle = "#09110d";
  arenaContext.fillRect(0, 0, width, height);
  arenaContext.strokeStyle = "#17271d";
  arenaContext.lineWidth = 1;
  for (let index = 1; index < 8; index++) {
    const x = width * index / 8;
    const y = height * index / 8;
    arenaContext.beginPath();
    arenaContext.moveTo(x, 0);
    arenaContext.lineTo(x, height);
    arenaContext.stroke();
    arenaContext.beginPath();
    arenaContext.moveTo(0, y);
    arenaContext.lineTo(width, y);
    arenaContext.stroke();
  }

  for (const player of latestSnapshot.players) {
    const x = (player.position[0] / (WORLD_RADIUS * 2) + 0.5) * width;
    const y = (player.position[1] / (WORLD_RADIUS * 2) + 0.5) * height;
    const local = player.playerId === localClient?.playerId;
    arenaContext.beginPath();
    arenaContext.arc(x, y, local ? 11 : 9, 0, Math.PI * 2);
    arenaContext.fillStyle = playerColor(player.playerId);
    arenaContext.fill();
    if (local) {
      arenaContext.strokeStyle = "#ffffff";
      arenaContext.lineWidth = 2;
      arenaContext.stroke();
    }
    arenaContext.fillStyle = "#dce9df";
    arenaContext.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    arenaContext.textAlign = "center";
    arenaContext.fillText(player.playerId, x, y - 16);
  }
}

function playerColor(playerId: string) {
  let hash = 0;
  for (const character of playerId) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 70% 62%)`;
}

function pumpHostClock(now: number) {
  const elapsed = Math.min(0.1, Math.max(0, (now - lastHostClock) / 1000));
  lastHostClock = now;
  hostRuntime?.advance(elapsed);
}

function frame(now: number) {
  pumpHostClock(now);
  sendCurrentInput(now);
  tickStatus.textContent = String(latestTick);
  playerCountStatus.textContent = String(
    hostRuntime?.playerCount ?? latestSnapshot.players.length,
  );
  renderArena();
  requestAnimationFrame(frame);
}

const keyDirections: Record<string, string | undefined> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowDown: "down",
  KeyS: "down",
  ArrowRight: "right",
  KeyD: "right",
};

window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable)
  ) return;
  const direction = keyDirections[event.code];
  if (!direction) return;
  event.preventDefault();
  setDirection(direction, true);
});
window.addEventListener("keyup", (event) => {
  const direction = keyDirections[event.code];
  if (!direction) return;
  setDirection(direction, false);
});
window.addEventListener("blur", () => {
  for (const direction of [...pressedDirections]) setDirection(direction, false);
});
arena.addEventListener("pointerdown", () => arena.focus());
document.querySelectorAll<HTMLButtonElement>("[data-direction]").forEach((button) => {
  const direction = button.dataset.direction;
  if (!direction) return;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    setDirection(direction, true);
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(eventName, () => setDirection(direction, false));
  }
});

createOfferButton.addEventListener("click", () => {
  void runAction(createOfferButton, createHostSlot).finally(updateHostTransportStatus);
});
inviteNameInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  createOfferButton.click();
});
closeButton.addEventListener("click", () => closeCurrent("local close"));
element("#clear-log").addEventListener("click", () => eventLog.replaceChildren());
window.addEventListener("beforeunload", () => closeCurrent("page unload", false, true));

const initialDirectFragment = /^#(?:invite|response)=/u.test(window.location.hash)
  ? window.location.hash
  : null;
if (initialDirectFragment) {
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
}

async function processInitialDirectFragment() {
  if (!initialDirectFragment) return;
  const decoded = decodeDirectFragment(initialDirectFragment, directCodec);
  if (!decoded.ok) {
    directActionTitle.textContent = "Invalid Direct Invite";
    directActionStatus.textContent = decoded.error.message;
    return;
  }
  try {
    if (decoded.value.message.type === "invite") {
      await handleDirectInvite(decoded.value.message);
    } else {
      await handleDirectResponse(decoded.value.message, initialDirectFragment);
    }
  } catch (error) {
    directActionTitle.textContent = "Connection failed";
    directActionStatus.textContent = errorMessage(error);
    setConnectionStatus("Failed", "failed");
  }
}

resetGamePresentation();
requestAnimationFrame(frame);
void processInitialDirectFragment();
