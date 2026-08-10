import * as THREE from "three";
import { decodeDirectFragment } from "../../../net/invite/fragment";
import { DirectInviteCodec } from "../../../net/invite/codec";
import { handoffDirectResponse } from "../../../net/invite/handoff";
import type { DirectInvite, DirectResponse } from "../../../net/invite/types";
import { createCarAudio, type CarAudio } from "../audio/car-audio";
import { DRIVING_PROFILES } from "../driving-profiles";
import { GAME_MAPS } from "../maps";
import { buildWorld } from "../world/build-world";
import { createDrivingWorldQuery } from "../world/driving-world-query";
import { HostedDrivingSession, type HostedDrivingSlot } from "./hosted-session";
import { JoinedDrivingSession } from "./joined-session";
import {
  PRODUCTION_DRIVING_COMPOSITION,
  createMultiplayerDrivingConfig,
} from "./ruleset";
import type {
  AuthoritativeDrivingEvent,
  AuthoritativeDrivingInput,
  AuthoritativeDrivingSnapshot,
} from "./simulation";
import { createAuthoritativeVehicleFleet } from "./vehicle-fleet";

const directCodec = new DirectInviteCodec();
type PlaySession = {
  playerId: string | null;
  state: string;
  update(now: number): AuthoritativeDrivingSnapshot | null;
  sendInput(input: AuthoritativeDrivingInput): void;
  close(): void;
  paused?: boolean;
  setPaused?(paused: boolean): void;
  canResume?: boolean;
  onEvent?(handler: (event: AuthoritativeDrivingEvent) => void): void;
  readiness?: {
    waiting: boolean;
    unreadyPlayers: string[];
    elapsedMs: number;
  };
  diagnostics?: {
    roundTripMs: number | null;
    snapshotJitterMs: number;
    bufferedSnapshots: number;
    underflowRate: number;
    extrapolationRate: number;
  } | null;
};

export function decodeDrivingDirectFragment(fragment: string) {
  return decodeDirectFragment(fragment, directCodec);
}

export async function startHostedDrivingGame(root: HTMLElement) {
  const worldHolder = createWorld(root);
  const simulationWorld = createSimulationWorld(PRODUCTION_DRIVING_COMPOSITION.mapId);
  const inviteBase = new URL("/?multiplayer=join", window.location.origin).toString();
  const session = new HostedDrivingSession(
    createDrivingWorldQuery(simulationWorld.world),
    inviteBase,
    simulationWorld.destroy,
  );
  const overlay = setupOverlay(root, "Host multiplayer");
  const controls = document.createElement("div");
  controls.className = "multiplayer-host-controls";
  controls.innerHTML = `
    <section class="multiplayer-control-group multiplayer-configuration" aria-labelledby="multiplayer-configuration-title">
      <div class="multiplayer-group-heading">
        <h2 id="multiplayer-configuration-title">Game configuration</h2>
        <p>Applies to everyone when the host resumes.</p>
      </div>
      <label>Mode <select disabled><option>Cruise</option></select></label>
      <label>Map <select class="multiplayer-map"></select></label>
    </section>
    <section class="multiplayer-control-group multiplayer-invites" aria-labelledby="multiplayer-invites-title">
      <div class="multiplayer-group-heading">
        <h2 id="multiplayer-invites-title">Invite players</h2>
        <p>Create one private connection link for each friend.</p>
      </div>
      <label>Friend name <span>optional, local only</span><input maxlength="40" autocomplete="off"></label>
      <button class="multiplayer-create-invite" type="button">Create invite</button>
      <div class="multiplayer-slots"></div>
    </section>
  `;
  overlay.body.append(controls);
  const mapSelect = controls.querySelector(".multiplayer-map") as HTMLSelectElement;
  for (const map of Object.values(GAME_MAPS)) {
    const option = document.createElement("option");
    option.value = map.id;
    option.textContent = map.title;
    mapSelect.append(option);
  }
  mapSelect.value = PRODUCTION_DRIVING_COMPOSITION.mapId;
  let acceptedMapId: keyof typeof GAME_MAPS = PRODUCTION_DRIVING_COMPOSITION.mapId;
  mapSelect.addEventListener("change", () => {
    if (session.readiness.waiting) {
      mapSelect.value = acceptedMapId;
      overlay.status.textContent = "Finish the current map transition before selecting another map.";
      return;
    }
    const mapId = mapSelect.value as keyof typeof GAME_MAPS;
    let nextSimulationWorld: ReturnType<typeof createSimulationWorld> | null = null;
    try {
      session.setPaused(true);
      nextSimulationWorld = createSimulationWorld(mapId);
      session.reconfigure(
        createMultiplayerDrivingConfig(
          createDrivingWorldQuery(nextSimulationWorld.world),
          mapId,
        ),
        nextSimulationWorld.destroy,
      );
      nextSimulationWorld = null;
      acceptedMapId = mapId;
      overlay.status.textContent = `Loading ${GAME_MAPS[mapId].title}. Waiting for players…`;
    } catch (error) {
      nextSimulationWorld?.destroy();
      mapSelect.value = acceptedMapId;
      overlay.status.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  const input = controls.querySelector("input") as HTMLInputElement;
  const createButton = controls.querySelector(".multiplayer-create-invite") as HTMLButtonElement;
  const slotsRoot = controls.querySelector(".multiplayer-slots") as HTMLElement;
  createButton.addEventListener("click", () => {
    createButton.disabled = true;
    void session.createInvite(input.value).then(() => {
      input.value = "";
    }).catch((error) => {
      overlay.status.textContent = error instanceof Error ? error.message : String(error);
    }).finally(() => { createButton.disabled = false; });
  });
  session.onSlots((slots) => renderSlots(slotsRoot, slots));
  session.setPaused(true);
  overlay.status.textContent = "Create one private invite per friend. Keep this tab open while each friend returns their response link.";
  startPlayLoop(root, worldHolder, session, overlay);
}

export async function startJoinedDrivingGame(root: HTMLElement, invite: DirectInvite) {
  const worldHolder = createWorld(root);
  const responseBase = new URL("/?multiplayer=response", window.location.origin).toString();
  const overlay = setupOverlay(root, "Join multiplayer");
  overlay.status.textContent = "Gathering a private WebRTC response…";
  try {
    const session = await JoinedDrivingSession.create(invite, responseBase);
    const actions = document.createElement("div");
    actions.className = "multiplayer-link-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy response";
    bindCopyFeedback(copy, session.responseUrl, "response");
    actions.append(copy);
    appendShareButton(actions, session.responseUrl, "Game response");
    overlay.body.append(actions, createLinkDetails(session.responseUrl, "response"));
    overlay.status.textContent = "Share the response with the host, keep this tab open, and wait. You will join automatically when the host opens it.";
    startPlayLoop(root, worldHolder, session, overlay);
  } catch (error) {
    worldHolder.destroy();
    overlay.status.textContent = error instanceof Error ? error.message : String(error);
  }
}

export async function handleDrivingResponseLanding(
  root: HTMLElement,
  response: DirectResponse,
  fragment: string,
) {
  const overlay = setupOverlay(root, "Delivering response");
  overlay.status.textContent = "Looking for the running host game tab…";
  const result = await handoffDirectResponse(response.sessionId, fragment);
  overlay.status.textContent = result.message ?? (result.accepted
    ? "Response delivered to the host."
    : "Open the matching host tab, then reopen this response link.");
  if (result.accepted) {
    setTimeout(() => window.close(), 250);
  } else {
    const fallbackUrl = createResponseFallbackUrl(fragment);
    const actions = document.createElement("div");
    actions.className = "multiplayer-link-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy response";
    bindCopyFeedback(copy, fallbackUrl, "response");
    actions.append(copy);
    appendShareButton(actions, fallbackUrl, "Game response");
    overlay.body.append(actions, createLinkDetails(fallbackUrl, "response"));
  }
}

function createLinkDetails(url: string, label: string) {
  const details = document.createElement("details");
  details.className = "multiplayer-link-details";
  const summary = document.createElement("summary");
  summary.textContent = `Show ${label} link`;
  const output = document.createElement("output");
  output.textContent = url;
  details.append(summary, output);
  return details;
}

function createResponseFallbackUrl(fragment: string) {
  const url = new URL("/?multiplayer=response", window.location.origin);
  url.hash = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return url.toString();
}

function createSimulationWorld(mapId: keyof typeof GAME_MAPS) {
  const scene = new THREE.Scene();
  const world = buildWorld(scene, GAME_MAPS[mapId]);
  return {
    world,
    destroy: () => world.destroy(),
  };
}

function createWorld(root: HTMLElement) {
  const canvas = root.querySelector<HTMLCanvasElement>("#game-canvas");
  if (!canvas) throw new Error("Driving canvas is unavailable.");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeaf6ef, 0x5d632a, 1.65));
  const sun = new THREE.DirectionalLight(0xffe6ad, 3.35);
  sun.position.set(-52, 64, -38);
  scene.add(sun);
  let mapId: keyof typeof GAME_MAPS = PRODUCTION_DRIVING_COMPOSITION.mapId;
  let world = buildMapWorld(mapId);

  function buildMapWorld(nextMapId: keyof typeof GAME_MAPS) {
    const map = GAME_MAPS[nextMapId];
    scene.background = new THREE.Color(map.environment.background);
    scene.fog = new THREE.Fog(map.environment.background, map.environment.fogNear, map.environment.fogFar);
    return buildWorld(scene, map);
  }

  return {
    canvas,
    renderer,
    scene,
    get world() { return world; },
    get mapId() { return mapId; },
    setMap(nextMapId: keyof typeof GAME_MAPS) {
      if (nextMapId === mapId) return;
      const nextWorld = buildMapWorld(nextMapId);
      const previous = world;
      world = nextWorld;
      mapId = nextMapId;
      previous.destroy();
    },
    destroy() {
      world.destroy();
      renderer.dispose();
    },
  };
}

function startPlayLoop(
  root: HTMLElement,
  holder: ReturnType<typeof createWorld>,
  session: PlaySession,
  overlay: ReturnType<typeof setupOverlay>,
) {
  root.dataset.multiplayer = "true";
  const coarsePointerQuery = window.matchMedia("(any-pointer: coarse)");
  const desktopPointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  const updateInputCapabilities = () => {
    root.dataset.touchCapable = String(navigator.maxTouchPoints > 0 || coarsePointerQuery.matches);
    root.dataset.desktopControls = String(desktopPointerQuery.matches);
  };
  updateInputCapabilities();
  coarsePointerQuery.addEventListener("change", updateInputCapabilities);
  desktopPointerQuery.addEventListener("change", updateInputCapabilities);
  root.querySelector("#intro")?.classList.add("is-hidden");
  root.querySelector<HTMLElement>("#speed-lines-canvas")?.setAttribute("hidden", "");
  root.querySelectorAll<HTMLElement>("#leaderboard-button, #reset-button")
    .forEach((element) => { element.hidden = true; });
  const pauseButton = root.querySelector<HTMLButtonElement>("#pause-button");
  const pauseOverlay = root.querySelector<HTMLElement>("#pause-overlay");
  const pauseHeading = pauseOverlay?.querySelector<HTMLElement>("h2");
  const resumeButton = root.querySelector<HTMLButtonElement>("#resume-driving");
  const cameraButton = root.querySelector<HTMLButtonElement>("#camera-button");
  const canPause = typeof session.setPaused === "function";
  if (pauseButton) pauseButton.hidden = false;
  pauseOverlay?.classList.add("is-multiplayer");
  pauseOverlay?.append(overlay.overlay);
  const pauseActions = pauseOverlay?.querySelector<HTMLElement>(".pause-actions");
  pauseActions?.append(overlay.audio, overlay.leave);
  const diagnosticsHud = document.createElement("output");
  diagnosticsHud.className = "multiplayer-network-hud";
  diagnosticsHud.setAttribute("aria-label", "Network diagnostics");
  diagnosticsHud.textContent = "Measuring network…";
  root.append(diagnosticsHud);
  const fleet = createAuthoritativeVehicleFleet(holder.scene);
  const chaseCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 2_000);
  const isometricCamera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 2_000);
  const sideCamera = new THREE.OrthographicCamera(-17, 17, 12, -12, 0.1, 2_000);
  const cameraModes = ["Chase", "Isometric", "Side"] as const;
  let cameraMode: typeof cameraModes[number] = "Chase";
  const waitingPosition = holder.world.spawnPosition.clone();
  const waitingForward = new THREE.Vector3(
    Math.sin(holder.world.spawnHeading),
    0,
    Math.cos(holder.world.spawnHeading),
  );
  const waitingTarget = waitingPosition.clone().add(new THREE.Vector3(0, 1, 0));
  chaseCamera.position
    .copy(waitingPosition)
    .addScaledVector(waitingForward, -7)
    .add(new THREE.Vector3(0, 4, 0));
  chaseCamera.lookAt(waitingTarget);
  isometricCamera.position.copy(waitingPosition).add(new THREE.Vector3(26, 48, 26));
  isometricCamera.lookAt(waitingPosition);
  sideCamera.position.copy(waitingPosition).add(new THREE.Vector3(30, 15, 0));
  sideCamera.lookAt(waitingTarget);
  const controls = { left: false, right: false, handbrake: false };
  let destroyed = false;
  let frameId = 0;
  let lastTime = performance.now();
  let lastInput = "";
  let loadedEpoch: number | undefined;
  let trackedEpoch: number | undefined;
  let cameraInitialized = false;
  let audio: CarAudio | null = null;
  let audioPaused: boolean | undefined;
  let lastRenderedSnapshot: AuthoritativeDrivingSnapshot | null = null;
  let hostPauseSnapshot: AuthoritativeDrivingSnapshot | null = null;
  let localMenuOpen = false;
  const ensureAudio = () => {
    audio ??= createCarAudio(DRIVING_PROFILES.loose);
    if (audio) overlay.audio.hidden = true;
  };
  root.addEventListener("pointerdown", ensureAudio);

  const sendControls = (force = false) => {
    const input: AuthoritativeDrivingInput = {
      steering: controls.left === controls.right ? 0 : controls.left ? -1 : 1,
      throttle: 0,
      brake: false,
      handbrake: controls.handbrake,
      ...(loadedEpoch === undefined ? {} : { readyEpoch: loadedEpoch }),
    };
    const signature = JSON.stringify(input);
    if (!force && signature === lastInput) return;
    lastInput = signature;
    session.sendInput(input);
  };
  const loadAuthoritativeMap = (mapId: string) => {
    if (!(mapId in GAME_MAPS)) return false;
    try {
      holder.setMap(mapId as keyof typeof GAME_MAPS);
      return true;
    } catch (error) {
      overlay.status.textContent = `Could not load the host map: ${error instanceof Error ? error.message : String(error)}`;
      session.close();
      return false;
    }
  };
  session.onEvent?.((event) => {
    if (event.type === "collision" && event.playerId === session.playerId) {
      audio?.impact(event.terminal ? 1 : 0.55);
      return;
    }
    if (event.type !== "configuration" || !loadAuthoritativeMap(event.mapId)) return;
    fleet.update({ players: [] }, 0);
    lastRenderedSnapshot = null;
    hostPauseSnapshot = null;
    loadedEpoch = event.configurationEpoch;
    trackedEpoch = event.configurationEpoch;
    cameraInitialized = false;
    root.dataset.gameMap = event.mapId;
    root.dataset.gameMode = event.modeId;
    sendControls(true);
  });
  const setControl = (name: keyof typeof controls, pressed: boolean) => {
    controls[name] = pressed;
    sendControls();
  };
  const keyControl = (code: string): keyof typeof controls | null => {
    if (code === "ArrowLeft" || code === "KeyA") return "left";
    if (code === "ArrowRight" || code === "KeyD") return "right";
    if (code === "Space") return "handbrake";
    return null;
  };
  const switchCamera = () => {
    cameraMode = cameraModes[(cameraModes.indexOf(cameraMode) + 1) % cameraModes.length];
    cameraInitialized = false;
    if (cameraButton) cameraButton.title = `Camera: ${cameraMode} (C)`;
  };
  cameraButton?.addEventListener("click", switchCamera);
  const renderPauseControl = (paused: boolean) => {
    if (!pauseButton) return;
    pauseButton.setAttribute("aria-pressed", String(paused));
    const label = pauseButton.querySelector(".action-label");
    const mobileLabel = pauseButton.querySelector(".action-mobile");
    if (label) label.textContent = paused ? "Resume" : "Pause";
    if (mobileLabel) mobileLabel.textContent = paused ? "▶" : "Ⅱ";
    pauseButton.title = paused ? "Resume game (P)" : "Pause game (P)";
  };
  renderPauseControl(session.paused === true);
  if (!canPause && pauseButton) {
    const label = pauseButton.querySelector(".action-label");
    const mobileLabel = pauseButton.querySelector(".action-mobile");
    if (label) label.textContent = "Menu";
    if (mobileLabel) mobileLabel.textContent = "☰";
    pauseButton.title = "Session menu (Escape)";
  }
  const togglePause = () => {
    if (!session.setPaused) return;
    const paused = !session.paused;
    if (paused && lastRenderedSnapshot) hostPauseSnapshot = lastRenderedSnapshot;
    try {
      session.setPaused(paused);
    } catch (error) {
      if (paused) hostPauseSnapshot = null;
      overlay.status.textContent = error instanceof Error ? error.message : String(error);
      return;
    }
    renderPauseControl(paused);
    overlay.status.textContent = paused
      ? "Game paused by host."
      : "Game resumed. Create invites while keeping this tab open.";
  };
  const toggleLocalMenu = () => {
    localMenuOpen = !localMenuOpen;
    if (localMenuOpen) {
      controls.left = false;
      controls.right = false;
      controls.handbrake = false;
      sendControls(true);
    }
  };
  const pauseAction = canPause ? togglePause : toggleLocalMenu;
  const resumeAction = canPause ? togglePause : () => { localMenuOpen = false; };
  pauseButton?.addEventListener("click", pauseAction);
  resumeButton?.addEventListener("click", resumeAction);
  const isTypingTarget = (target: EventTarget | null) => target instanceof HTMLElement
    && target.closest("input, textarea, select, [contenteditable='true']") !== null;
  const isButtonActivation = (event: KeyboardEvent) => event.target instanceof HTMLElement
    && event.target.closest("button, a") !== null
    && (event.code === "Space" || event.code === "Enter");
  const onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target) || isButtonActivation(event)) return;
    ensureAudio();
    if (!event.repeat && event.code === "KeyC") {
      event.preventDefault();
      switchCamera();
      return;
    }
    if (!event.repeat && (event.code === "KeyP" || event.code === "Escape")) {
      event.preventDefault();
      if (canPause) togglePause();
      else toggleLocalMenu();
      return;
    }
    const control = keyControl(event.code);
    if (!control) return;
    event.preventDefault();
    setControl(control, true);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target) || isButtonActivation(event)) return;
    const control = keyControl(event.code);
    if (control) setControl(control, false);
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  const inputHeartbeat = window.setInterval(() => sendControls(true), 1000 / 30);
  const touchCleanups: (() => void)[] = [];
  root.querySelectorAll<HTMLElement>("[data-control]").forEach((button) => {
    const name = button.dataset.control;
    if (name !== "left" && name !== "right" && name !== "handbrake") return;
    const down = (event: PointerEvent) => { event.preventDefault(); setControl(name, true); };
    const up = () => setControl(name, false);
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    touchCleanups.push(() => {
      button.removeEventListener("pointerdown", down);
      button.removeEventListener("pointerup", up);
      button.removeEventListener("pointercancel", up);
    });
  });

  function frame(now: number) {
    if (destroyed) return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const width = Math.max(root.clientWidth, 1);
    const height = Math.max(root.clientHeight, 1);
    holder.renderer.setSize(width, height, false);
    const aspect = width / height;
    chaseCamera.aspect = aspect;
    chaseCamera.updateProjectionMatrix();
    isometricCamera.left = -20 * aspect;
    isometricCamera.right = 20 * aspect;
    isometricCamera.updateProjectionMatrix();
    sideCamera.left = -12 * aspect;
    sideCamera.right = 12 * aspect;
    sideCamera.updateProjectionMatrix();
    const sampledSnapshot = session.update(now);
    if (session.paused === true && hostPauseSnapshot === null && lastRenderedSnapshot) {
      hostPauseSnapshot = lastRenderedSnapshot;
    }
    if (session.paused !== true && sampledSnapshot?.paused !== true) hostPauseSnapshot = null;
    const holdHostPresentation = hostPauseSnapshot !== null
      && (session.paused === true || sampledSnapshot?.paused === true);
    let snapshot = sampledSnapshot;
    if (hostPauseSnapshot && holdHostPresentation) {
      if (sampledSnapshot) {
        const frozenPlayers = new Map(
          hostPauseSnapshot.players.map((player) => [player.playerId, player]),
        );
        snapshot = {
          ...sampledSnapshot,
          paused: true,
          players: sampledSnapshot.players.map((player) => frozenPlayers.get(player.playerId) ?? player),
        };
      } else snapshot = { ...hostPauseSnapshot, paused: true };
    }
    if (session.state === "closed") {
      fleet.update({ players: [] }, dt);
      overlay.status.textContent = "The host ended this multiplayer session.";
      overlay.playerCount.textContent = "Session closed";
      overlay.playerList.textContent = "";
    } else if (snapshot) {
      if (snapshot.configurationEpoch !== undefined && snapshot.configurationEpoch !== trackedEpoch) {
        if (snapshot.mapId && loadAuthoritativeMap(snapshot.mapId)) {
          root.dataset.gameMap = snapshot.mapId;
        }
        if (snapshot.modeId) root.dataset.gameMode = snapshot.modeId;
        fleet.update({ players: [] }, 0);
        trackedEpoch = snapshot.configurationEpoch;
        cameraInitialized = false;
      }
      if (snapshot.configurationEpoch !== undefined) loadedEpoch = snapshot.configurationEpoch;
      fleet.update(snapshot, dt);
      const local = snapshot.players.find((player) => player.playerId === session.playerId);
      if (local) {
        if (audioPaused !== snapshot.paused) {
          audioPaused = snapshot.paused === true;
          audio?.setPaused(audioPaused);
        }
        if (audio && !snapshot.paused) {
          const forwardX = Math.sin(local.heading);
          const forwardZ = Math.cos(local.heading);
          const forwardSpeed = local.velocity[0] * forwardX + local.velocity[1] * forwardZ;
          audio.update({
            dt,
            speed: local.speed,
            forwardSpeed,
            signedSlipDegrees: THREE.MathUtils.radToDeg(local.visualSlip),
            steeringLoad: Math.abs(local.steering ?? 0) * THREE.MathUtils.clamp(local.speed / 14, 0, 1),
            steerDirection: local.steering ?? 0,
            phase: local.driftPhase,
            onPavement: true,
            boosting: local.boosting,
            throttle: 1,
            braking: controls.handbrake,
            reversing: forwardSpeed < -0.35,
          });
        }
        root.dataset.localVehiclePosition = `${local.position[0]},${local.position[1]}`;
        const position = new THREE.Vector3(local.position[0], 0, local.position[1]);
        const forward = new THREE.Vector3(Math.sin(local.heading), 0, Math.cos(local.heading));
        if (!snapshot.paused || !cameraInitialized) {
          const follow = cameraInitialized ? 1 - Math.exp(-5 * dt) : 1;
          const lookTarget = position.clone().add(new THREE.Vector3(0, 1, 0));
          if (cameraMode === "Chase") {
            const target = position.clone().addScaledVector(forward, -7).add(new THREE.Vector3(0, 4, 0));
            chaseCamera.position.lerp(target, follow);
            chaseCamera.lookAt(lookTarget);
          } else if (cameraMode === "Isometric") {
            const target = position.clone().add(new THREE.Vector3(26, 48, 26));
            isometricCamera.position.lerp(target, follow);
            isometricCamera.up.set(0, 1, 0);
            isometricCamera.lookAt(position);
          } else {
            const target = position.clone().add(new THREE.Vector3(30, 15, 0));
            sideCamera.position.lerp(target, follow);
            sideCamera.up.set(0, 1, 0);
            sideCamera.lookAt(lookTarget);
          }
          cameraInitialized = true;
        }
      }
      overlay.playerCount.textContent = `${snapshot.players.length} player${snapshot.players.length === 1 ? "" : "s"} connected`;
      overlay.playerList.textContent = snapshot.players.map((player) => player.playerId).join(" · ");
      if (!canPause && snapshot.paused) {
        const mapTitle = snapshot.mapId && snapshot.mapId in GAME_MAPS
          ? GAME_MAPS[snapshot.mapId as keyof typeof GAME_MAPS].title
          : snapshot.mapId ?? "selected map";
        overlay.status.textContent = `Paused by host while loading ${mapTitle}.`;
      }
      else if (!canPause && !snapshot.paused) overlay.status.textContent = "Connected to host.";
      if (!holdHostPresentation) lastRenderedSnapshot = snapshot;
      const diagnostics = session.diagnostics;
      diagnosticsHud.textContent = diagnostics
        ? `RTT ${diagnostics.roundTripMs === null ? "…" : `${Math.round(diagnostics.roundTripMs)} ms`} · jitter ${Math.round(diagnostics.snapshotJitterMs)} ms · buffer ${diagnostics.bufferedSnapshots} · underflow ${Math.round(diagnostics.underflowRate * 100)}% · extrapolation ${Math.round(diagnostics.extrapolationRate * 100)}%`
        : "Measuring network…";
      if (pauseButton && session.paused) {
        pauseButton.disabled = session.canResume === false;
        if (session.canResume === false) {
          const readiness = session.readiness;
          const waitingCount = readiness?.unreadyPlayers.length ?? 0;
          const elapsedSeconds = Math.floor((readiness?.elapsedMs ?? 0) / 1_000);
          overlay.status.textContent = elapsedSeconds >= 15
            ? `Still waiting for ${waitingCount} player${waitingCount === 1 ? "" : "s"} after ${elapsedSeconds}s. They may need to leave and reopen the invite.`
            : `Waiting for ${waitingCount} player${waitingCount === 1 ? "" : "s"} to load the selected map…`;
        }
      } else if (pauseButton) pauseButton.disabled = false;
    }
    const hasLocalPlayer = snapshot?.players.some((player) => player.playerId === session.playerId) === true;
    const waitingForConnection = session.state !== "connected" || !hasLocalPlayer;
    const globallyPaused = session.paused === true || snapshot?.paused === true;
    const showPausePanel = waitingForConnection || globallyPaused || localMenuOpen;
    pauseOverlay?.classList.toggle("is-visible", showPausePanel);
    pauseOverlay?.setAttribute("aria-hidden", String(!showPausePanel));
    if (pauseHeading) pauseHeading.textContent = waitingForConnection
      ? (canPause ? "Connecting…" : "Waiting for host…")
      : globallyPaused ? "Session paused." : "Session menu.";
    if (resumeButton) resumeButton.hidden = waitingForConnection
      || (canPause ? session.canResume === false : globallyPaused);
    const activeCamera = cameraMode === "Chase"
      ? chaseCamera
      : cameraMode === "Isometric" ? isometricCamera : sideCamera;
    root.dataset.localCameraPosition = `${activeCamera.position.x},${activeCamera.position.y},${activeCamera.position.z}`;
    holder.renderer.render(holder.scene, activeCamera);
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(frameId);
    clearInterval(inputHeartbeat);
    pauseButton?.removeEventListener("click", pauseAction);
    resumeButton?.removeEventListener("click", resumeAction);
    cameraButton?.removeEventListener("click", switchCamera);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    touchCleanups.forEach((cleanup) => cleanup());
    root.removeEventListener("pointerdown", ensureAudio);
    coarsePointerQuery.removeEventListener("change", updateInputCapabilities);
    desktopPointerQuery.removeEventListener("change", updateInputCapabilities);
    audio?.destroy();
    diagnosticsHud.remove();
    pauseOverlay?.classList.remove("is-visible", "is-multiplayer");
    fleet.destroy();
    session.close();
    holder.destroy();
  };
  overlay.leave.hidden = false;
  overlay.leave.addEventListener("click", () => {
    destroy();
    window.location.href = "/";
  }, { once: true });
  window.addEventListener("beforeunload", destroy, { once: true });
  document.addEventListener("astro:before-swap", destroy, { once: true });
}

function setupOverlay(root: HTMLElement, title: string) {
  const overlay = root.querySelector<HTMLElement>("#multiplayer-overlay");
  if (!overlay) throw new Error("Multiplayer overlay is unavailable.");
  overlay.hidden = false;
  overlay.innerHTML = `<div class="multiplayer-card"><p class="eyebrow">Drive together</p><h1></h1><p class="multiplayer-status"></p><p class="multiplayer-player-count"></p><p class="multiplayer-player-list"></p><div class="multiplayer-body"></div><button class="multiplayer-audio" type="button">Enable audio</button><button class="multiplayer-leave" type="button" hidden>Leave session</button></div>`;
  const heading = overlay.querySelector("h1") as HTMLElement;
  const status = overlay.querySelector(".multiplayer-status") as HTMLElement;
  const playerCount = overlay.querySelector(".multiplayer-player-count") as HTMLElement;
  const playerList = overlay.querySelector(".multiplayer-player-list") as HTMLElement;
  const body = overlay.querySelector(".multiplayer-body") as HTMLElement;
  const audio = overlay.querySelector(".multiplayer-audio") as HTMLButtonElement;
  const leave = overlay.querySelector(".multiplayer-leave") as HTMLButtonElement;
  heading.textContent = title;
  return { overlay, status, playerCount, playerList, body, audio, leave };
}

function bindCopyFeedback(button: HTMLButtonElement, value: string, label: string) {
  const originalText = button.textContent ?? "Copy";
  let resetTimer = 0;
  button.setAttribute("aria-live", "polite");
  button.addEventListener("click", () => {
    clearTimeout(resetTimer);
    void Promise.resolve().then(() => navigator.clipboard.writeText(value)).then(() => {
      button.textContent = "Copied!";
      button.setAttribute("aria-label", `${label} copied to clipboard`);
      button.classList.add("is-copied");
    }).catch(() => {
      button.textContent = "Copy failed";
      button.setAttribute("aria-label", `Could not copy ${label}`);
      button.classList.remove("is-copied");
    }).finally(() => {
      resetTimer = window.setTimeout(() => {
        button.textContent = originalText;
        button.removeAttribute("aria-label");
        button.classList.remove("is-copied");
      }, 1_800);
    });
  });
}

function appendShareButton(root: HTMLElement, url: string, title: string) {
  if (typeof navigator.share !== "function") return;
  const share = document.createElement("button");
  share.type = "button";
  share.textContent = "Share…";
  share.addEventListener("click", () => {
    void navigator.share({ title, url }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      share.textContent = "Share failed";
      window.setTimeout(() => { share.textContent = "Share…"; }, 1_800);
    });
  });
  root.append(share);
}

function renderSlots(root: HTMLElement, slots: readonly HostedDrivingSlot[]) {
  root.replaceChildren(...slots.map((slot) => {
    const row = document.createElement("div");
    row.className = "multiplayer-slot";
    const label = document.createElement("strong");
    label.textContent = slot.name || `Invite ${slot.id}`;
    const status = document.createElement("span");
    status.textContent = slot.status;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy invite";
    copy.dataset.url = slot.inviteUrl;
    copy.disabled = slot.status !== "waiting";
    bindCopyFeedback(copy, slot.inviteUrl, "invite");
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", slot.close);
    row.append(label, status, copy);
    appendShareButton(row, slot.inviteUrl, "Drive with friends");
    row.append(close);
    return row;
  }));
}
