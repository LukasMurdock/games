import * as THREE from "three";
import { decodeDirectFragment } from "../../../net/invite/fragment";
import { DirectInviteCodec } from "../../../net/invite/codec";
import { handoffDirectResponse } from "../../../net/invite/handoff";
import type { DirectInvite, DirectResponse } from "../../../net/invite/types";
import { GAME_MAPS } from "../maps";
import { buildWorld } from "../world/build-world";
import { createDrivingWorldQuery } from "../world/driving-world-query";
import { HostedDrivingSession, type HostedDrivingSlot } from "./hosted-session";
import { JoinedDrivingSession } from "./joined-session";
import { PRODUCTION_DRIVING_COMPOSITION } from "./ruleset";
import type { AuthoritativeDrivingInput, AuthoritativeDrivingSnapshot } from "./simulation";
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
};

export function decodeDrivingDirectFragment(fragment: string) {
  return decodeDirectFragment(fragment, directCodec);
}

export async function startHostedDrivingGame(root: HTMLElement) {
  const worldHolder = createWorld(root);
  const inviteBase = new URL("/?multiplayer=join", window.location.origin).toString();
  const session = new HostedDrivingSession(createDrivingWorldQuery(worldHolder.world), inviteBase);
  const overlay = setupOverlay(root, "Host multiplayer");
  const controls = document.createElement("div");
  controls.className = "multiplayer-host-controls";
  controls.innerHTML = `
    <label>Friend name <span>optional, local only</span><input maxlength="40" autocomplete="off"></label>
    <button type="button">Create invite</button>
    <div class="multiplayer-slots"></div>
  `;
  overlay.body.append(controls);
  const input = controls.querySelector("input") as HTMLInputElement;
  const createButton = controls.querySelector("button") as HTMLButtonElement;
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
  overlay.status.textContent = "Host ready. Create an invite while keeping this tab open.";
  startPlayLoop(root, worldHolder, session, overlay);
}

export async function startJoinedDrivingGame(root: HTMLElement, invite: DirectInvite) {
  const worldHolder = createWorld(root);
  const responseBase = new URL("/?multiplayer=response", window.location.origin).toString();
  const overlay = setupOverlay(root, "Join multiplayer");
  overlay.status.textContent = "Gathering a private WebRTC response…";
  try {
    const session = await JoinedDrivingSession.create(invite, responseBase);
    const output = document.createElement("output");
    output.textContent = session.responseUrl;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy response";
    copy.addEventListener("click", () => void navigator.clipboard.writeText(session.responseUrl));
    overlay.body.append(output, copy);
    overlay.status.textContent = "Send this response link to the host. This game will connect when they open it.";
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
    const output = document.createElement("output");
    output.textContent = fallbackUrl;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy response";
    copy.addEventListener("click", () => void navigator.clipboard.writeText(fallbackUrl));
    overlay.body.append(output, copy);
  }
}

function createResponseFallbackUrl(fragment: string) {
  const url = new URL("/?multiplayer=response", window.location.origin);
  url.hash = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  return url.toString();
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
  const map = GAME_MAPS[PRODUCTION_DRIVING_COMPOSITION.mapId];
  scene.background = new THREE.Color(map.environment.background);
  scene.fog = new THREE.Fog(map.environment.background, map.environment.fogNear, map.environment.fogFar);
  scene.add(new THREE.HemisphereLight(0xeaf6ef, 0x5d632a, 1.65));
  const sun = new THREE.DirectionalLight(0xffe6ad, 3.35);
  sun.position.set(-52, 64, -38);
  scene.add(sun);
  const world = buildWorld(scene, map);
  return {
    canvas,
    renderer,
    scene,
    world,
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
  root.querySelector("#intro")?.classList.add("is-hidden");
  root.querySelector<HTMLElement>("#speed-lines-canvas")?.setAttribute("hidden", "");
  root.querySelectorAll<HTMLElement>("#leaderboard-button, #reset-button")
    .forEach((element) => { element.hidden = true; });
  const pauseButton = root.querySelector<HTMLButtonElement>("#pause-button");
  const canPause = typeof session.setPaused === "function";
  if (pauseButton) pauseButton.hidden = !canPause;
  const fleet = createAuthoritativeVehicleFleet(holder.scene);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 350);
  const controls = { left: false, right: false, handbrake: false };
  let destroyed = false;
  let frameId = 0;
  let lastTime = performance.now();
  let lastInput = "";

  const sendControls = (force = false) => {
    const input: AuthoritativeDrivingInput = {
      steering: controls.left === controls.right ? 0 : controls.left ? -1 : 1,
      throttle: 0,
      brake: false,
      handbrake: controls.handbrake,
    };
    const signature = JSON.stringify(input);
    if (!force && signature === lastInput) return;
    lastInput = signature;
    session.sendInput(input);
  };
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
  const togglePause = () => {
    if (!session.setPaused) return;
    const paused = !session.paused;
    session.setPaused(paused);
    if (pauseButton) {
      pauseButton.setAttribute("aria-pressed", String(paused));
      const label = pauseButton.querySelector(".action-label");
      const mobileLabel = pauseButton.querySelector(".action-mobile");
      if (label) label.textContent = paused ? "Resume" : "Pause";
      if (mobileLabel) mobileLabel.textContent = paused ? "▶" : "Ⅱ";
      pauseButton.title = paused ? "Resume game (P)" : "Pause game (P)";
    }
    overlay.status.textContent = paused
      ? "Game paused by host."
      : "Game resumed. Create invites while keeping this tab open.";
  };
  pauseButton?.addEventListener("click", togglePause);
  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.repeat && (event.code === "KeyP" || event.code === "Escape") && canPause) {
      event.preventDefault();
      togglePause();
      return;
    }
    const control = keyControl(event.code);
    if (!control) return;
    event.preventDefault();
    setControl(control, true);
  };
  const onKeyUp = (event: KeyboardEvent) => {
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
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const snapshot = session.update(now);
    if (session.state === "closed") {
      fleet.update({ players: [] }, dt);
      overlay.status.textContent = "The host ended this multiplayer session.";
      overlay.playerCount.textContent = "Session closed";
      overlay.playerList.textContent = "";
    } else if (snapshot) {
      fleet.update(snapshot, dt);
      const local = snapshot.players.find((player) => player.playerId === session.playerId);
      if (local) {
        const position = new THREE.Vector3(local.position[0], 0, local.position[1]);
        const forward = new THREE.Vector3(Math.sin(local.heading), 0, Math.cos(local.heading));
        camera.position.lerp(position.clone().addScaledVector(forward, -7).add(new THREE.Vector3(0, 4, 0)), 1 - Math.exp(-5 * dt));
        camera.lookAt(position.clone().add(new THREE.Vector3(0, 1, 0)));
      }
      overlay.playerCount.textContent = `${snapshot.players.length} player${snapshot.players.length === 1 ? "" : "s"} connected`;
      overlay.playerList.textContent = snapshot.players.map((player) => player.playerId).join(" · ");
    }
    holder.renderer.render(holder.scene, camera);
    frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(frameId);
    clearInterval(inputHeartbeat);
    pauseButton?.removeEventListener("click", togglePause);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    touchCleanups.forEach((cleanup) => cleanup());
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
  overlay.innerHTML = `<div class="multiplayer-card"><p class="eyebrow">Drive together</p><h1></h1><p class="multiplayer-status"></p><p class="multiplayer-player-count"></p><p class="multiplayer-player-list"></p><div class="multiplayer-body"></div><button class="multiplayer-leave" type="button" hidden>Leave session</button></div>`;
  const heading = overlay.querySelector("h1") as HTMLElement;
  const status = overlay.querySelector(".multiplayer-status") as HTMLElement;
  const playerCount = overlay.querySelector(".multiplayer-player-count") as HTMLElement;
  const playerList = overlay.querySelector(".multiplayer-player-list") as HTMLElement;
  const body = overlay.querySelector(".multiplayer-body") as HTMLElement;
  const leave = overlay.querySelector(".multiplayer-leave") as HTMLButtonElement;
  heading.textContent = title;
  return { overlay, status, playerCount, playerList, body, leave };
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
    copy.addEventListener("click", () => void navigator.clipboard.writeText(slot.inviteUrl));
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", slot.close);
    row.append(label, status, copy, close);
    return row;
  }));
}
