import * as THREE from "three";
import { DRIVING_PROFILES } from "./driving-profiles";
import { createLeaderboardToast } from "./feedback/leaderboard-toast";
import { createSpeedLines } from "./feedback/speed-lines";
import { addLocalDriveResult, getLocalDriveLeaderboard } from "./local-leaderboard";
import { DEFAULT_GAME_MAP_ID, GAME_MAPS, type GameMapDefinition, type GameMapId } from "./maps";
import { GAME_MODES, type GameModeController, type GameModeId } from "./modes";
import type { CameraMode, ControlMode, DriveEndReason, DrivingGameOptions } from "./types";
import type { PlayerControlName } from "./player";
import { createLocalDrivingSession } from "./session/local-driving-session";
import { buildWorld } from "./world/build-world";


const UP = new THREE.Vector3(0, 1, 0);
const MANUAL_CONTROLS_UNLOCKED_KEY = "driving-game:manual-controls-unlocked:v1";
const CONTROL_MODE_KEY = "driving-game:control-mode:v1";
const MANUAL_CONTROL_CODE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
];

export function startDrivingGame(root: HTMLElement, options: DrivingGameOptions = {}) {
  let map: GameMapDefinition = GAME_MAPS[options.map ?? DEFAULT_GAME_MAP_ID];
  let mode = GAME_MODES[options.mode ?? "cruise"];
  const drivingProfileOverride = options.drivingProfile;
  let drivingProfileId = drivingProfileOverride ?? mode.drivingProfile;
  let DRIVING = DRIVING_PROFILES[drivingProfileId];
  const canvas = root.querySelector<HTMLCanvasElement>("#game-canvas");
  const speedLinesCanvas = root.querySelector<HTMLCanvasElement>("#speed-lines-canvas");
  const modeHud = root.querySelector<HTMLElement>("#mode-hud");
  const mapDiagnostics = root.querySelector<HTMLElement>("#map-diagnostics");
  const leaderboardNode = root.querySelector<HTMLElement>("#drive-leaderboard");
  const intro = root.querySelector<HTMLElement>("#intro");
  const startButton = root.querySelector<HTMLButtonElement>("#start-driving");
  const pauseOverlay = root.querySelector<HTMLElement>("#pause-overlay");
  const leaderboardButton = root.querySelector<HTMLButtonElement>("#leaderboard-button");
  const pauseButton = root.querySelector<HTMLButtonElement>("#pause-button");
  const pauseDriveTime = root.querySelector<HTMLElement>("#pause-drive-time");
  const resumeButton = root.querySelector<HTMLButtonElement>("#resume-driving");
  const fullscreenButton = root.querySelector<HTMLButtonElement>("#fullscreen-button");
  if (
    !canvas
    || !speedLinesCanvas
    || !modeHud
    || !leaderboardNode
    || !intro
    || !startButton
    || !pauseOverlay
    || !leaderboardButton
    || !pauseButton
    || !pauseDriveTime
    || !resumeButton
  ) return;
  const gameCanvas = canvas;
  const introLayer = intro;
  const leaderboardControl = leaderboardButton;
  const modeHudRoot = modeHud;
  const startControl = startButton;
  const pauseLayer = pauseOverlay;
  const pauseControl = pauseButton;
  const pauseDriveTimeDisplay = pauseDriveTime;
  const resumeControl = resumeButton;
  const showMapDiagnostics = new URLSearchParams(window.location.search).get("debug") === "map";
  if (mapDiagnostics) mapDiagnostics.hidden = !showMapDiagnostics;
  const fullscreenControl = fullscreenButton;
  const lifecycle = new AbortController();
  const listenerOptions = { signal: lifecycle.signal };
  const coarsePointerQuery = window.matchMedia("(any-pointer: coarse)");
  const desktopControlsQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  let desktopControlsAvailable = desktopControlsQuery.matches;
  let manualControlsUnlocked = readStoredBoolean(MANUAL_CONTROLS_UNLOCKED_KEY);
  let controlMode: ControlMode = desktopControlsAvailable
      && manualControlsUnlocked
      && readStoredValue(CONTROL_MODE_KEY) === "manual"
    ? "manual"
    : "automatic";
  function updateInputCapabilities() {
    const touchCapable = navigator.maxTouchPoints > 0 || coarsePointerQuery.matches;
    desktopControlsAvailable = desktopControlsQuery.matches;
    root.dataset.touchCapable = String(touchCapable);
    root.dataset.desktopControls = String(desktopControlsAvailable);
  }
  updateInputCapabilities();
  coarsePointerQuery.addEventListener("change", updateInputCapabilities, listenerOptions);
  desktopControlsQuery.addEventListener("change", updateInputCapabilities, listenerOptions);
  root.dataset.input = "keyboard";

  const introEyebrow = intro.querySelector<HTMLElement>(".eyebrow");
  const introTitle = intro.querySelector<HTMLElement>("h1");
  const introDescription = intro.querySelector<HTMLElement>(".intro-card > p:not(.eyebrow)");
  const modeOptions = root.querySelectorAll<HTMLButtonElement>("[data-mode-option]");
  const mapOptions = root.querySelectorAll<HTMLButtonElement>("[data-map-option]");
  const controlModeOptions = root.querySelectorAll<HTMLButtonElement>("[data-control-mode-option]");
  const controlModeSettings = root.querySelectorAll<HTMLElement>(".control-mode-setting");
  const manualControlGuides = root.querySelectorAll<HTMLElement>(".manual-control-guide");
  function updateModePresentation() {
    if (introEyebrow) introEyebrow.textContent = mode.copy.eyebrow;
    if (introTitle) introTitle.textContent = mode.copy.title;
    if (introDescription) introDescription.textContent = mode.copy.description;
    if (startControl.firstChild) startControl.firstChild.textContent = `${mode.copy.startLabel} `;
    modeOptions.forEach((option) => {
      option.setAttribute("aria-pressed", String(option.dataset.modeOption === mode.id));
    });
    root.dataset.gameMode = mode.id;
  }
  function updateMapPresentation() {
    mapOptions.forEach((option) => {
      option.setAttribute("aria-pressed", String(option.dataset.mapOption === map.id));
    });
    root.dataset.gameMap = map.id;
  }
  function updateControlModePresentation() {
    controlModeSettings.forEach((setting) => (setting.hidden = !manualControlsUnlocked));
    controlModeOptions.forEach((option) => {
      option.setAttribute("aria-pressed", String(option.dataset.controlModeOption === controlMode));
    });
    manualControlGuides.forEach((guide) => (guide.hidden = controlMode !== "manual"));
    root.dataset.controlMode = controlMode;
  }
  updateModePresentation();
  updateMapPresentation();
  updateControlModePresentation();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(map.environment.background);
  scene.fog = new THREE.Fog(map.environment.background, map.environment.fogNear, map.environment.fogFar);

  const perspectiveCamera = new THREE.PerspectiveCamera(60, 1, 0.1, map.environment.cameraFar);
  const isometricCamera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, map.environment.cameraFar);
  const sideCamera = new THREE.OrthographicCamera(-17, 17, 12, -12, 0.1, map.environment.sideCameraFar);
  let cameraMode: CameraMode = "Isometric";
  const cameraModes: CameraMode[] = ["Chase", "Isometric", "Side"];

  scene.add(new THREE.HemisphereLight(0xeaf6ef, 0x5d632a, 1.65));
  const sun = new THREE.DirectionalLight(0xffe6ad, 3.35);
  sun.position.set(-52, 64, -38);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const initialShadowExtent = Math.min(map.environment.shadowExtent, 48);
  sun.shadow.camera.left = -initialShadowExtent;
  sun.shadow.camera.right = initialShadowExtent;
  sun.shadow.camera.top = initialShadowExtent;
  sun.shadow.camera.bottom = -initialShadowExtent;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = map.environment.shadowFar;
  scene.add(sun, sun.target);

  function applyMapEnvironment() {
    scene.background = new THREE.Color(map.environment.background);
    scene.fog = new THREE.Fog(
      map.environment.background,
      map.environment.fogNear,
      map.environment.fogFar,
    );
    perspectiveCamera.far = map.environment.cameraFar;
    perspectiveCamera.updateProjectionMatrix();
    isometricCamera.far = map.environment.cameraFar;
    isometricCamera.updateProjectionMatrix();
    sideCamera.far = map.environment.sideCameraFar;
    sideCamera.updateProjectionMatrix();
    const shadowExtent = Math.min(map.environment.shadowExtent, 48);
    sun.shadow.camera.left = -shadowExtent;
    sun.shadow.camera.right = shadowExtent;
    sun.shadow.camera.top = shadowExtent;
    sun.shadow.camera.bottom = -shadowExtent;
    sun.shadow.camera.far = map.environment.shadowFar;
    sun.shadow.camera.updateProjectionMatrix();
  }

  let world = buildWorld(scene, map, { debug: showMapDiagnostics });
  const debugLayerVisibility = {
    pavement: false,
    colliders: false,
    grid: false,
    source: showMapDiagnostics,
    districts: false,
  };
  let inspectedDistrictIndex = -1;
  function applyDebugLayerVisibility() {
    for (const [layer, visible] of Object.entries(debugLayerVisibility)) {
      world.setDebugLayer(layer as keyof typeof debugLayerVisibility, visible);
    }
  }
  applyDebugLayerVisibility();
  const speedLines = createSpeedLines(speedLinesCanvas);
  const leaderboardToast = createLeaderboardToast(leaderboardNode);
  const getLeaderboardTitle = () => mode.id === "chase" ? "Longest survival" : "Longest drives";
  const getLeaderboardResults = () => getLocalDriveLeaderboard({
    mode: mode.id,
    map: map.id,
    drivingProfile: drivingProfileId,
    controlMode,
    limit: 100,
  });
  let modeController: GameModeController | null = null;
  let driveTime = 0;
  let running = false;
  let paused = false;
  let destroyed = false;

  function recordDrive(reason: DriveEndReason) {
    if (!running || driveTime <= 0) return;
    const result = addLocalDriveResult({
      durationSeconds: driveTime,
      reason,
      mode: mode.id,
      map: map.id,
      drivingProfile: drivingProfileId,
      controlMode,
    });
    if (result) leaderboardToast.show(getLeaderboardResults(), result.id, getLeaderboardTitle());
  }

  function endDrive(reason: DriveEndReason = "manual") {
    recordDrive(reason);
    driveTime = 0;
    player.reset();
    modeController?.reset(reason);
  }

  const player = createLocalDrivingSession({
    scene,
    world,
    profile: DRIVING,
    controlMode,
    onEvent: (event) => modeController?.onPlayerEvent(event),
    onResetRequested: endDrive,
  });
  const shadowFocus = new THREE.Vector2(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  function updatePlayerCenteredShadows() {
    const position = player.getSnapshot().position;
    const extent = Math.min(map.environment.shadowExtent, 48);
    const texelSize = extent * 2 / sun.shadow.mapSize.width;
    const focusX = Math.round(position.x / texelSize) * texelSize;
    const focusZ = Math.round(position.z / texelSize) * texelSize;
    if (shadowFocus.x === focusX && shadowFocus.y === focusZ) return;
    shadowFocus.set(focusX, focusZ);
    sun.position.set(focusX - 52, 64, focusZ - 38);
    sun.target.position.set(focusX, 0, focusZ);
  }

  const keyMap: Record<string, PlayerControlName | undefined> = {
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
    ArrowUp: "accelerate",
    KeyW: "accelerate",
    ArrowDown: "brake",
    KeyS: "brake",
    Space: "handbrake",
  };

  function clearControls() {
    player.clearControls();
    root.querySelectorAll("[data-control]").forEach((node) => node.classList.remove("is-active"));
  }

  function setPaused(nextPaused: boolean) {
    if (!running) return;
    paused = nextPaused;
    clearControls();
    player.setPaused(paused);
    modeController?.pause(paused);
    pauseDriveTimeDisplay.textContent = formatDriveTime(driveTime);
    pauseLayer.classList.toggle("is-visible", paused);
    pauseLayer.setAttribute("aria-hidden", String(!paused));
    pauseControl.setAttribute("aria-pressed", String(paused));
    if (paused) resumeControl.focus();
    else gameCanvas.focus();
  }

  function createSelectedModeController() {
    return mode.createController({
      scene,
      hudRoot: modeHudRoot,
      map,
      world,
      getPlayer: player.getSnapshot,
      applyPlayerCollision: player.applyExternalCollision,
      getDriveTime: () => driveTime,
      endDrive: () => endDrive("mode"),
    });
  }

  modeController = createSelectedModeController();

  function selectMode(modeId: GameModeId) {
    if (mode.id === modeId || (running && !paused)) return;
    const switchingPausedGame = running && paused;
    if (switchingPausedGame) recordDrive("mode");
    modeController?.destroy();
    leaderboardToast.destroy();
    leaderboardControl.setAttribute("aria-pressed", "false");
    driveTime = 0;
    pauseDriveTimeDisplay.textContent = formatDriveTime(driveTime);
    mode = GAME_MODES[modeId];
    drivingProfileId = drivingProfileOverride ?? mode.drivingProfile;
    DRIVING = DRIVING_PROFILES[drivingProfileId];
    player.setDrivingProfile(DRIVING);
    player.reset();
    modeController = createSelectedModeController();
    modeController.reset("manual");
    if (switchingPausedGame) {
      modeController.start();
      modeController.pause(true);
    }
    updateModePresentation();

    const url = new URL(window.location.href);
    if (modeId === "cruise") url.searchParams.delete("mode");
    else url.searchParams.set("mode", modeId);
    window.history.replaceState(window.history.state, "", url);
  }

  function selectMap(mapId: GameMapId) {
    if (map.id === mapId || (running && !paused)) return;
    const nextMap = GAME_MAPS[mapId];
    const nextWorld = buildWorld(scene, nextMap, { debug: showMapDiagnostics });
    const previousWorld = world;
    const switchingPausedGame = running && paused;
    if (switchingPausedGame) recordDrive("mode");
    modeController?.destroy();
    leaderboardToast.destroy();
    leaderboardControl.setAttribute("aria-pressed", "false");
    driveTime = 0;
    pauseDriveTimeDisplay.textContent = formatDriveTime(driveTime);
    map = nextMap;
    inspectedDistrictIndex = -1;
    delete root.dataset.inspectedDistrict;
    isometricCamera.zoom = 1;
    isometricCamera.updateProjectionMatrix();
    world = nextWorld;
    applyMapEnvironment();
    previousWorld.destroy();
    applyDebugLayerVisibility();
    player.setWorld(world);
    player.reset();
    player.setPaused(paused);
    modeController = createSelectedModeController();
    modeController.reset("manual");
    if (switchingPausedGame) {
      modeController.start();
      modeController.pause(true);
    }
    updateMapPresentation();
    resetCameraTracking();

    const url = new URL(window.location.href);
    if (mapId === DEFAULT_GAME_MAP_ID) url.searchParams.delete("map");
    else url.searchParams.set("map", mapId);
    window.history.replaceState(window.history.state, "", url);
  }

  function selectControlMode(nextMode: ControlMode) {
    if (
      controlMode === nextMode
      || (nextMode === "manual" && (!manualControlsUnlocked || !desktopControlsAvailable))
      || (running && !paused)
    ) return;
    const switchingPausedGame = running && paused;
    if (switchingPausedGame) recordDrive("mode");
    leaderboardToast.destroy();
    leaderboardControl.setAttribute("aria-pressed", "false");
    driveTime = 0;
    pauseDriveTimeDisplay.textContent = formatDriveTime(driveTime);
    controlMode = nextMode;
    writeStoredValue(CONTROL_MODE_KEY, controlMode);
    player.setControlMode(controlMode);
    player.reset();
    modeController?.reset("manual");
    if (switchingPausedGame) {
      modeController?.start();
      modeController?.pause(true);
    }
    updateControlModePresentation();
    resetCameraTracking();
  }

  function unlockManualControls() {
    if (!desktopControlsAvailable) return;
    manualControlsUnlocked = true;
    writeStoredValue(MANUAL_CONTROLS_UNLOCKED_KEY, "true");
    updateControlModePresentation();
    selectControlMode("manual");
  }

  let manualCodeIndex = 0;
  let lastManualCodeInput = Number.NEGATIVE_INFINITY;
  function registerManualCodeInput(code: string) {
    if (!desktopControlsAvailable || (running && !paused)) {
      manualCodeIndex = 0;
      return;
    }
    const now = performance.now();
    if (now - lastManualCodeInput > 2500) manualCodeIndex = 0;
    lastManualCodeInput = now;
    if (code === MANUAL_CONTROL_CODE[manualCodeIndex]) manualCodeIndex += 1;
    else manualCodeIndex = code === MANUAL_CONTROL_CODE[0] ? 1 : 0;
    if (manualCodeIndex === MANUAL_CONTROL_CODE.length) {
      manualCodeIndex = 0;
      unlockManualControls();
    }
  }

  function switchCamera() {
    const index = (cameraModes.indexOf(cameraMode) + 1) % cameraModes.length;
    cameraMode = cameraModes[index];
  }

  function clearDistrictInspection() {
    if (inspectedDistrictIndex < 0) return;
    inspectedDistrictIndex = -1;
    delete root.dataset.inspectedDistrict;
    isometricCamera.zoom = 1;
    isometricCamera.updateProjectionMatrix();
    player.reset();
    player.setPaused(paused);
    modeController?.reset("manual");
    resetCameraTracking();
  }

  function inspectDistrict(direction: number) {
    if (!showMapDiagnostics || (map.compiledDistricts?.length ?? 0) === 0) return;
    const districts = map.compiledDistricts ?? [];
    inspectedDistrictIndex = (inspectedDistrictIndex + direction + districts.length) % districts.length;
    const district = districts[inspectedDistrictIndex];
    const entrance = district.entrances[0];
    const fallbackHeading = map.spawn.source === "position" ? map.spawn.heading : 0;
    const heading = entrance?.heading ?? fallbackHeading;
    const x = (entrance?.x ?? district.center.x) - Math.sin(heading) * 7;
    const z = (entrance?.z ?? district.center.z) - Math.cos(heading) * 7;
    driveTime = 0;
    clearControls();
    modeController?.reset("manual");
    player.placeAt(x, z, heading);
    player.setPaused(true);
    cameraMode = "Isometric";
    const districtSize = Math.max(
      district.bounds.maxX - district.bounds.minX,
      district.bounds.maxZ - district.bounds.minZ,
    );
    isometricCamera.zoom = THREE.MathUtils.clamp(30 / districtSize, 0.28, 0.72);
    isometricCamera.updateProjectionMatrix();
    root.dataset.inspectedDistrict = district.id;
    resetCameraTracking();
  }

  function toggleLeaderboard() {
    const visible = leaderboardToast.toggle(getLeaderboardResults(), getLeaderboardTitle());
    leaderboardControl.setAttribute("aria-pressed", String(visible));
  }

  const fullscreenAvailable = Boolean(document.fullscreenEnabled && root.requestFullscreen);
  if (fullscreenControl) fullscreenControl.hidden = !fullscreenAvailable;
  function updateFullscreenPresentation() {
    if (!fullscreenControl) return;
    fullscreenControl.textContent = document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen";
  }
  async function toggleFullscreen() {
    if (!fullscreenAvailable) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.requestFullscreen({ navigationUI: "hide" });
    } catch {
      // Fullscreen is optional and may be rejected by the browser or embedding context.
    }
  }

  function onKey(event: KeyboardEvent, pressed: boolean) {
    root.dataset.input = "keyboard";
    const control = keyMap[event.code];
    if (control) {
      player.setControl(control, pressed);
      event.preventDefault();
    }
    if (!pressed) registerManualCodeInput(event.code);
    if (!pressed && event.code === "KeyC") switchCamera();
    if (!pressed && event.code === "KeyL") toggleLeaderboard();
    if (!pressed && showMapDiagnostics && event.code.startsWith("Digit")) {
      const layer = ({
        Digit1: "pavement",
        Digit2: "colliders",
        Digit3: "grid",
        Digit4: "source",
        Digit5: "districts",
      } as const)[event.code as "Digit1" | "Digit2" | "Digit3" | "Digit4" | "Digit5"];
      if (layer) {
        debugLayerVisibility[layer] = !debugLayerVisibility[layer];
        world.setDebugLayer(layer, debugLayerVisibility[layer]);
      }
    }
    if (!pressed && showMapDiagnostics && event.code === "BracketRight") inspectDistrict(1);
    if (!pressed && showMapDiagnostics && event.code === "BracketLeft") inspectDistrict(-1);
    if (!pressed && showMapDiagnostics && event.code === "Backslash") clearDistrictInspection();
    if (!pressed && event.code === "KeyR") endDrive("manual");
    if (!pressed && (event.code === "KeyP" || event.code === "Escape")) {
      event.preventDefault();
      setPaused(!paused);
    }
  }

  window.addEventListener("keydown", (event) => onKey(event, true), listenerOptions);
  window.addEventListener("keyup", (event) => onKey(event, false), listenerOptions);
  window.addEventListener("pointerdown", (event) => {
    root.dataset.input = event.pointerType || "mouse";
  }, { ...listenerOptions, capture: true });
  for (const eventName of ["selectstart", "dragstart", "contextmenu"]) {
    root.addEventListener(eventName, (event) => event.preventDefault(), {
      ...listenerOptions,
      capture: true,
    });
  }
  document.addEventListener("selectionchange", () => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const anchorInside = selection.anchorNode ? root.contains(selection.anchorNode) : false;
    const focusInside = selection.focusNode ? root.contains(selection.focusNode) : false;
    if (anchorInside || focusInside) selection.removeAllRanges();
  }, listenerOptions);
  window.addEventListener("blur", clearControls, listenerOptions);

  modeOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const modeId = option.dataset.modeOption;
      if (!modeId || !(modeId in GAME_MODES)) return;
      selectMode(modeId as GameModeId);
    }, listenerOptions);
  });

  mapOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const mapId = option.dataset.mapOption;
      if (!mapId || !(mapId in GAME_MAPS)) return;
      selectMap(mapId as GameMapId);
    }, listenerOptions);
  });

  controlModeOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const nextMode = option.dataset.controlModeOption;
      if (nextMode !== "automatic" && nextMode !== "manual") return;
      selectControlMode(nextMode);
    }, listenerOptions);
  });

  root.querySelectorAll<HTMLElement>("[data-control]").forEach((button) => {
    const name = button.dataset.control as PlayerControlName;
    const setPressed = (pressed: boolean, event: Event) => {
      event.preventDefault();
      player.setControl(name, pressed);
      button.classList.toggle("is-active", pressed);
    };
    button.addEventListener("pointerdown", (event) => {
      button.setPointerCapture(event.pointerId);
      setPressed(true, event);
    }, listenerOptions);
    button.addEventListener("pointerup", (event) => setPressed(false, event), listenerOptions);
    button.addEventListener("pointercancel", (event) => setPressed(false, event), listenerOptions);
    button.addEventListener("lostpointercapture", (event) => setPressed(false, event), listenerOptions);
    // WebKit can still start its long-press loupe/callout despite user-select and
    // touch-action. Keep Pointer Events as input, but cancel that native touch default.
    button.addEventListener("touchstart", (event) => event.preventDefault(), {
      ...listenerOptions,
      passive: false,
    });
    for (const eventName of ["contextmenu", "selectstart", "dragstart"]) {
      button.addEventListener(eventName, (event) => event.preventDefault(), listenerOptions);
    }
  });

  root.querySelector("#camera-button")?.addEventListener("click", switchCamera, listenerOptions);
  leaderboardControl.addEventListener("click", toggleLeaderboard, listenerOptions);
  root.querySelector("#reset-button")?.addEventListener("click", () => endDrive("manual"), listenerOptions);
  pauseButton.addEventListener("click", () => setPaused(true), listenerOptions);
  resumeButton.addEventListener("click", () => setPaused(false), listenerOptions);
  fullscreenControl?.addEventListener("click", toggleFullscreen, listenerOptions);
  document.addEventListener("fullscreenchange", () => {
    updateFullscreenPresentation();
    scheduleResize();
  }, listenerOptions);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && running && !paused) setPaused(true);
  }, listenerOptions);
  startControl.addEventListener("click", () => {
    running = true;
    paused = false;
    player.start();
    player.setPaused(false);
    modeController?.start();
    introLayer.classList.add("is-hidden");
    canvas.focus();
  }, listenerOptions);

  const initialPlayerState = player.getSnapshot();
  const lookTarget = initialPlayerState.position.clone();
  const isometricFocus = initialPlayerState.position.clone();
  const isometricOffset = new THREE.Vector3(26, 48, 26);
  const cameraPosition = new THREE.Vector3();
  function resetCameraTracking() {
    const playerState = player.getSnapshot();
    lookTarget.copy(playerState.position).add(new THREE.Vector3(0, 1, 0));
    isometricFocus.copy(playerState.position);
    cameraPosition.copy(playerState.position);
    updateCamera(1);
  }

  function updateCamera(dt: number) {
    const playerState = player.getSnapshot();
    const { position, velocity, heading, visualSlip, exitPulse, cameraShake } = playerState;
    const follow = 1 - Math.exp(-6 * dt);
    const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const speed = playerState.speed;
    const velocityDirection = speed > 0.5 ? velocity.clone().normalize() : forward.clone();
    const slipBlend = THREE.MathUtils.clamp(Math.abs(visualSlip) / THREE.MathUtils.degToRad(30), 0, 1) * 0.35;
    const cameraForward = forward.clone().lerp(velocityDirection, slipBlend).normalize();
    const speedRatio = THREE.MathUtils.clamp(speed / DRIVING.maximumSpeed, 0, 1);
    const speedLead = velocity.clone().multiplyScalar(0.045);
    lookTarget.lerp(position.clone().add(speedLead).add(new THREE.Vector3(0, 1, 0)), follow);

    const targetFov = 60 + speedRatio * 4 + slipBlend * 2 + exitPulse * 3;
    const nextFov = THREE.MathUtils.lerp(perspectiveCamera.fov, targetFov, 1 - Math.exp(-4 * dt));
    if (Math.abs(nextFov - perspectiveCamera.fov) > 0.01) {
      perspectiveCamera.fov = nextFov;
      perspectiveCamera.updateProjectionMatrix();
    }

    if (cameraMode === "Chase") {
      const cameraDistance = 5 + speedRatio * 0.5 + exitPulse * 0.2;
      const cameraHeight = 2 + speedRatio * 0.15;
      const targetPosition = position
        .clone()
        .addScaledVector(cameraForward, -cameraDistance)
        .add(new THREE.Vector3(0, cameraHeight, 0));
      cameraPosition.lerp(targetPosition, 1 - Math.exp(-4.5 * dt));
      perspectiveCamera.position.copy(cameraPosition);
      if (cameraShake > 0.001) {
        perspectiveCamera.position.x += (Math.random() - 0.5) * cameraShake;
        perspectiveCamera.position.y += (Math.random() - 0.5) * cameraShake;
      }
      perspectiveCamera.lookAt(lookTarget);
    } else if (cameraMode === "Isometric") {
      // Keep a stable world-space projection so buildings read as a diorama and steering never rotates the board.
      const inspectedDistrict = map.compiledDistricts?.[inspectedDistrictIndex];
      const focus = inspectedDistrict
        ? new THREE.Vector3(
            (inspectedDistrict.bounds.minX + inspectedDistrict.bounds.maxX) / 2,
            0,
            (inspectedDistrict.bounds.minZ + inspectedDistrict.bounds.maxZ) / 2,
          )
        : position;
      isometricFocus.lerp(focus, follow);
      isometricCamera.position.copy(isometricFocus).add(isometricOffset);
      isometricCamera.up.copy(UP);
      isometricCamera.lookAt(isometricFocus);
    } else {
      const targetPosition = position.clone().add(new THREE.Vector3(30, 15, 0));
      sideCamera.position.lerp(targetPosition, follow);
      sideCamera.up.copy(UP);
      sideCamera.lookAt(lookTarget);
    }
    player.decayCameraShake(dt);
  }

  function activeCamera(): THREE.Camera {
    if (cameraMode === "Isometric") return isometricCamera;
    if (cameraMode === "Side") return sideCamera;
    return perspectiveCamera;
  }

  const speedLineFocus = new THREE.Vector3();
  function updateSpeedLines(dt: number) {
    const playerState = player.getSnapshot();
    const camera = activeCamera();
    camera.updateMatrixWorld();
    speedLineFocus.set(playerState.position.x, 0.8, playerState.position.z).project(camera);
    const focusVisible = speedLineFocus.z >= -1 && speedLineFocus.z <= 1;
    const redlineIntensity = running && !paused && focusVisible && DRIVING.redlineAtMaximumSpeed
      ? THREE.MathUtils.smoothstep(
          playerState.speed,
          DRIVING.maximumSpeed * 0.94,
          DRIVING.maximumSpeed,
        )
      : 0;
    speedLines.update({
      dt,
      enabled: cameraMode === "Chase",
      intensity: redlineIntensity,
      focusX: (speedLineFocus.x * 0.5 + 0.5) * root.clientWidth,
      focusY: (-speedLineFocus.y * 0.5 + 0.5) * root.clientHeight,
      boosting: playerState.boosting,
    });
  }

  let lastOrientation: "portrait" | "landscape" | null = null;
  let resizeFrame = 0;
  function resize() {
    const width = Math.max(root.clientWidth, 1);
    const height = Math.max(root.clientHeight, 1);
    const orientation = width >= height ? "landscape" : "portrait";
    const orientationChanged = lastOrientation !== null && orientation !== lastOrientation;
    lastOrientation = orientation;
    root.dataset.orientation = orientation;
    root.dataset.layout = width <= 720 || height <= 520 ? "compact" : "wide";

    const pixelBudgetRatio = Math.sqrt(2_200_000 / (width * height));
    renderer.setPixelRatio(THREE.MathUtils.clamp(
      Math.min(window.devicePixelRatio, pixelBudgetRatio),
      1,
      2,
    ));
    renderer.setSize(width, height, false);
    speedLines.resize(width, height);
    perspectiveCamera.aspect = width / height;
    perspectiveCamera.updateProjectionMatrix();

    const aspect = width / height;
    // Preserve enough horizontal world space in portrait without changing landscape framing.
    const isometricSize = Math.max(20, 15 / aspect);
    isometricCamera.left = -isometricSize * aspect;
    isometricCamera.right = isometricSize * aspect;
    isometricCamera.top = isometricSize;
    isometricCamera.bottom = -isometricSize;
    isometricCamera.updateProjectionMatrix();

    const sideSize = Math.max(12, 9 / aspect);
    sideCamera.left = -sideSize * aspect;
    sideCamera.right = sideSize * aspect;
    sideCamera.top = sideSize;
    sideCamera.bottom = -sideSize;
    sideCamera.updateProjectionMatrix();

    if (orientationChanged) {
      clearControls();
      if (running && !paused) setPaused(true);
    }
  }

  function scheduleResize() {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      resize();
    });
  }

  const resizeObserver = new ResizeObserver(scheduleResize);
  resizeObserver.observe(root);
  window.addEventListener("resize", scheduleResize, listenerOptions);
  window.visualViewport?.addEventListener("resize", scheduleResize, listenerOptions);
  window.screen.orientation?.addEventListener("change", scheduleResize, listenerOptions);
  resize();
  player.reset();
  modeController.reset("manual");
  resetCameraTracking();

  let lastDiagnosticsUpdate = 0;
  function updateMapDiagnostics(now: number) {
    if (!showMapDiagnostics || !mapDiagnostics || now - lastDiagnosticsUpdate < 250) return;
    lastDiagnosticsUpdate = now;
    const diagnostics = world.getDiagnostics();
    const playerState = player.getSnapshot();
    const collisionAverage = diagnostics.collisionQueries > 0
      ? diagnostics.collisionCandidates / diagnostics.collisionQueries
      : 0;
    const pavementAverage = diagnostics.pavementQueries > 0
      ? diagnostics.pavementCandidates / diagnostics.pavementQueries
      : 0;
    const inspectedDistrict = map.compiledDistricts?.[inspectedDistrictIndex];
    const districtSummary = inspectedDistrict
      ? `${inspectedDistrict.id} · ${inspectedDistrict.hostCorridor ?? "absolute"} · ${inspectedDistrict.entrances.length} entrances`
      : "— · [ / ] inspect";
    mapDiagnostics.textContent = [
      `${map.title} · ${map.worldLimit * 2}u`,
      `position  ${playerState.position.x.toFixed(1)}, ${playerState.position.z.toFixed(1)}`,
      `draws     ${renderer.info.render.calls}`,
      `triangles ${renderer.info.render.triangles.toLocaleString()}`,
      `pixel DPR ${renderer.getPixelRatio().toFixed(2)}`,
      `build     ${diagnostics.buildMilliseconds.toFixed(1)} ms`,
      `obstacles ${diagnostics.obstacles}`,
      `pavement  ${diagnostics.pavementPrimitives}`,
      `layout    ${diagnostics.junctions} junctions · ${diagnostics.accessRoads} entrances`,
      `network   ${map.layoutDiagnostics?.connectedComponents ?? "—"} components · ${map.layoutDiagnostics?.deadEnds ?? "—"} dead ends`,
      `cycles    ${map.layoutDiagnostics?.cycleRank ?? "—"} · shortest ${map.layoutDiagnostics?.shortestSegment.toFixed(0) ?? "—"}u`,
      `decisions ${map.layoutDiagnostics?.maximumDecisionSpacing.toFixed(0) ?? "—"}u max · ${map.layoutDiagnostics?.acuteIntersections ?? "—"} acute`,
      `warnings  ${map.layoutDiagnostics?.warnings.join(" · ") || "none"}`,
      `district  ${districtSummary}`,
      `collision ${collisionAverage.toFixed(1)} candidates/query`,
      `surface   ${pavementAverage.toFixed(1)} candidates/query`,
      `GPU geom  ${renderer.info.memory.geometries}`,
      "layers    1 pavement · 2 colliders · 3 grid · 4 source · 5 districts",
    ].join("\n");
  }

  let lastTime = performance.now();
  function frame(now: number) {
    if (destroyed) return;
    const wallElapsed = Math.min((now - lastTime) / 1000, 1);
    const elapsed = Math.min(wallElapsed, 0.05);
    lastTime = now;
    if (running && !paused && inspectedDistrictIndex < 0) {
      if (modeController?.isDriveClockRunning() ?? true) driveTime += wallElapsed;
      player.update(elapsed);
      modeController?.update(elapsed);
    }
    updateCamera(elapsed);
    updatePlayerCenteredShadows();
    updateSpeedLines(wallElapsed);
    renderer.render(scene, activeCamera());
    updateMapDiagnostics(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener("astro:before-swap", () => {
    destroyed = true;
    lifecycle.abort();
    resizeObserver.disconnect();
    if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
    player.destroy();
    modeController?.destroy();
    world.destroy();
    leaderboardToast.destroy();
    speedLines.destroy();
    renderer.dispose();
  }, { once: true, signal: lifecycle.signal });
}

function readStoredValue(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readStoredBoolean(key: string) {
  return readStoredValue(key) === "true";
}

function writeStoredValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be disabled by browser privacy settings.
  }
}

function formatDriveTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.max(0, seconds - minutes * 60);
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}
