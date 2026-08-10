import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { DRIVING_PROFILES } from "./lib/driving-game/driving-profiles";
import { createDrivingVehicleSimulation } from "./lib/driving-game/simulation/vehicle-simulation";
import type { DriftPhase } from "./lib/driving-game/types";
import { createCar } from "./lib/driving-game/vehicle/create-car";

const DURATION = 40;
const PRODUCTION_DRIVE_TRACE = buildProductionDriveTrace();
const driftLabEnabled = new URLSearchParams(window.location.search).get("demoDebug") === "drift";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const demo = document.querySelector<HTMLElement>("#demo");
const loading = document.querySelector<HTMLElement>("#demo-loading");
const canvas = document.querySelector<HTMLCanvasElement>("#demo-canvas");
const title = document.querySelector<HTMLElement>("#demo-title");
const replay = document.querySelector<HTMLButtonElement>("#replay-demo");
const progress = document.querySelector<HTMLElement>("#demo-progress");

queueMicrotask(bootDemo);

function bootDemo() {
  if (reducedMotion.matches || !canvas) {
    title?.classList.add("is-visible");
    revealDemo();
    return;
  }
  try {
    startDemo(canvas);
  } catch (error) {
    console.error("The real-time demo could not start.", error);
    title?.classList.add("is-visible");
    revealDemo();
  }
}

function revealDemo() {
  demo?.classList.add("is-ready");
  loading?.remove();
}

type ProductionTraceSample = DriftPose & {
  time: number;
  distance: number;
  forwardSpeed: number;
  targetRoll: number;
  targetPitch: number;
  driftPhase: DriftPhase;
};

function buildProductionDriveTrace() {
  const world = {
    spawn: { x: 0, z: 0, heading: 0 },
    isOnPavement: () => true,
    queryCollision: () => null,
    isOutsideBoundary: () => false,
  };
  const simulation = createDrivingVehicleSimulation({
    world,
    profile: DRIVING_PROFILES.aggressive,
    controlMode: "automatic",
  });
  const dt = 1 / 120;
  for (let time = 0; time < 3.2; time += dt) simulation.update(dt);
  const origin = simulation.snapshot().position;
  const samples: ProductionTraceSample[] = [];
  const scale = 0.48;
  let steeringVisual = 0;
  let distance = 0;
  let previousX = 0;
  let previousZ = 0;

  for (let time = 0; time <= 20.2; time += dt) {
    const firstDrift = time >= 2 && time < 3.4;
    const secondDrift = time >= 3.4 && time < 5;
    const recoverySteer = time >= 5 && time < 5.7;
    simulation.setControl("left", firstDrift);
    simulation.setControl("right", secondDrift || recoverySteer);
    simulation.setControl("handbrake", firstDrift || secondDrift);
    const frame = simulation.update(dt);
    steeringVisual = THREE.MathUtils.lerp(
      steeringVisual,
      frame.steering * 0.48,
      1 - Math.exp(-12 * dt),
    );
    const x = -(frame.position.x - origin.x) * scale;
    const z = -(frame.position.z - origin.z) * scale;
    if (samples.length > 0) distance += Math.hypot(x - previousX, z - previousZ);
    previousX = x;
    previousZ = z;
    const velocityX = -frame.velocity.x;
    const velocityZ = -frame.velocity.z;
    const velocityHeading = Math.atan2(velocityX, velocityZ);
    const chassisHeading = normalizeAngle(frame.heading + Math.PI);
    samples.push({
      time,
      distance,
      x,
      z,
      velocityHeading,
      chassisHeading,
      steering: steeringVisual,
      slipAngle: frame.visualSlip,
      forwardSpeed: frame.forwardSpeed * scale,
      targetRoll: frame.targetRoll,
      targetPitch: frame.targetPitch,
      driftPhase: frame.driftPhase,
    });
  }
  return samples;
}

function sampleProductionTrace(time: number): ProductionTraceSample {
  const samplePosition = THREE.MathUtils.clamp(time * 120, 0, PRODUCTION_DRIVE_TRACE.length - 1);
  const lower = Math.floor(samplePosition);
  const upper = Math.min(PRODUCTION_DRIVE_TRACE.length - 1, lower + 1);
  const alpha = samplePosition - lower;
  const first = PRODUCTION_DRIVE_TRACE[lower];
  const second = PRODUCTION_DRIVE_TRACE[upper];
  return {
    time: THREE.MathUtils.lerp(first.time, second.time, alpha),
    distance: THREE.MathUtils.lerp(first.distance, second.distance, alpha),
    x: THREE.MathUtils.lerp(first.x, second.x, alpha),
    z: THREE.MathUtils.lerp(first.z, second.z, alpha),
    velocityHeading: first.velocityHeading + shortestAngle(first.velocityHeading, second.velocityHeading) * alpha,
    chassisHeading: first.chassisHeading + shortestAngle(first.chassisHeading, second.chassisHeading) * alpha,
    steering: THREE.MathUtils.lerp(first.steering, second.steering, alpha),
    slipAngle: THREE.MathUtils.lerp(first.slipAngle, second.slipAngle, alpha),
    forwardSpeed: THREE.MathUtils.lerp(first.forwardSpeed, second.forwardSpeed, alpha),
    targetRoll: THREE.MathUtils.lerp(first.targetRoll, second.targetRoll, alpha),
    targetPitch: THREE.MathUtils.lerp(first.targetPitch, second.targetPitch, alpha),
    driftPhase: alpha < 0.5 ? first.driftPhase : second.driftPhase,
  };
}

function sampleProductionTraceByDistance(distance: number) {
  let low = 0;
  let high = PRODUCTION_DRIVE_TRACE.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (PRODUCTION_DRIVE_TRACE[middle].distance < distance) low = middle + 1;
    else high = middle;
  }
  const upper = Math.min(PRODUCTION_DRIVE_TRACE.length - 1, low);
  const lower = Math.max(0, upper - 1);
  const first = PRODUCTION_DRIVE_TRACE[lower];
  const second = PRODUCTION_DRIVE_TRACE[upper];
  const span = Math.max(0.0001, second.distance - first.distance);
  return sampleProductionTrace(THREE.MathUtils.lerp(first.time, second.time, (distance - first.distance) / span));
}

function startDemo(target: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas: target,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x020405, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020405);
  scene.fog = new THREE.FogExp2(0x020405, 0.018);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 180);
  camera.position.set(0, 3.6, 13);
  camera.lookAt(0, 0.7, 0);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.45, 0.72, 0.12);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  scene.add(new THREE.HemisphereLight(0x87fff1, 0x08090d, 1.25));
  const whiteLight = new THREE.DirectionalLight(0xffffff, 3.8);
  whiteLight.position.set(3, 8, 7);
  scene.add(whiteLight);
  const cyanLight = new THREE.PointLight(0x22ffe0, 34, 24, 1.5);
  cyanLight.position.set(-6, 2, 5);
  scene.add(cyanLight);
  const magentaLight = new THREE.PointLight(0xff246f, 28, 22, 1.5);
  magentaLight.position.set(6, 1, 1);
  scene.add(magentaLight);

  const signalMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const signal = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), signalMaterial);
  scene.add(signal);

  const signalCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-8, 4.2, -3),
    new THREE.Vector3(-3.5, -0.7, 2),
    new THREE.Vector3(2.8, 2.7, 1),
    new THREE.Vector3(-2.1, 1.2, 0),
    new THREE.Vector3(0, 0.8, 0),
  ]);
  const signalPoints = signalCurve.getPoints(220);
  const signalTrailMaterial = new THREE.LineBasicMaterial({
    color: 0x4fffe6,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
  });
  const signalTrailGeometry = new THREE.BufferGeometry().setFromPoints(signalPoints);
  signalTrailGeometry.setDrawRange(0, 0);
  const signalTrail = new THREE.Line(signalTrailGeometry, signalTrailMaterial);
  scene.add(signalTrail);

  const player = makeDemoCar(false, 0xd94335);
  player.surface.position.y = 0.05;
  player.wire.position.y = 0.05;
  scene.add(player.surface, player.wire);

  const world = createLightWorld();
  scene.add(world.group);

  const police = makeDemoCar(true, 0x17222a);
  police.surface.visible = false;
  police.wire.visible = false;
  scene.add(police.surface, police.wire);
  const policeRed = new THREE.PointLight(0xff203e, 0, 18, 1.3);
  const policeBlue = new THREE.PointLight(0x218aff, 0, 18, 1.3);
  scene.add(policeRed, policeBlue);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 520),
    new THREE.MeshStandardMaterial({ color: 0x020506, roughness: 0.92, metalness: 0.08 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.025;
  scene.add(floor);

  const driftLab = driftLabEnabled ? createDriftLab(scene) : null;

  let startedAt = performance.now();
  let forcedTime: number | null = null;
  let frameId = 0;
  let firstFramePresented = false;

  replay?.addEventListener("click", () => {
    forcedTime = null;
    startedAt = performance.now();
    title?.classList.remove("is-visible");
  });

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, width < 700 ? 1.5 : 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.fov = width < height ? 54 : 46;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  const render = (now: number) => {
    let elapsed = driftLab
      ? driftLab.getTime(now)
      : forcedTime ?? (now - startedAt) / 1000;
    if (!driftLab && forcedTime === null && elapsed >= DURATION) {
      startedAt = now;
      elapsed = 0;
      title?.classList.remove("is-visible");
    }
    const normalized = elapsed / DURATION;
    updateSequence(elapsed, now / 1000);
    if (progress) progress.style.transform = `scaleX(${normalized})`;
    composer.render();
    if (!firstFramePresented) {
      firstFramePresented = true;
      requestAnimationFrame(() => {
        startedAt = performance.now();
        revealDemo();
      });
    }
    frameId = requestAnimationFrame(render);
  };

  const updateSequence = (time: number, clock: number) => {
    camera.up.set(0, 1, 0);
    if (demo) demo.dataset.demoTime = time.toFixed(3);
    const signalPhase = clamp01(time / 3);
    const signalIndex = Math.max(1, Math.floor(signalPhase * signalPoints.length));
    signalTrailGeometry.setDrawRange(0, signalIndex);
    signal.position.copy(signalCurve.getPoint(signalPhase));
    signal.scale.setScalar(0.75 + Math.sin(clock * 18) * 0.25);
    signal.visible = time < 4.8;
    signalTrailMaterial.opacity = 0.95 * (1 - smooth(3.5, 5.5, time));

    const wireReveal = smooth(2.2, 5, time) * (1 - smooth(7.4, 8.5, time));
    player.wireMaterial.opacity = wireReveal;
    player.wire.visible = wireReveal > 0.001;

    const surfaceReveal = smooth(4.4, 7.4, time);
    const resolution = driftLab ? 0 : smooth(20, 22.8, time);
    const playerResolutionFade = 1 - resolution;
    player.surfaceMaterial.opacity = surfaceReveal * playerResolutionFade;
    player.surface.visible = surfaceReveal * playerResolutionFade > 0.001;
    player.surface.rotation.y = time < 8.3
      ? Math.sin(Math.min(time, 7.4) * 0.42) * 0.28
      : Math.PI * smooth(8.3, 10.8, time);
    player.wire.rotation.copy(player.surface.rotation);

    const worldReveal = smooth(8.3, 10.5, time);
    setWorldOpacity(world, worldReveal * (1 - resolution));
    world.group.visible = worldReveal > 0.001;
    world.group.scale.z = 0.02 + worldReveal * 0.98;

    if (time < 11.2) {
      const orbit = smooth(3, 8, time);
      camera.position.set(Math.sin(time * 0.25) * orbit * 1.4, 3.4 - orbit * 0.5, 13 - orbit * 1.4);
      camera.lookAt(0, 0.75, 0);
      player.surface.position.set(0, 0.05, 0);
      player.surface.rotation.x = 0;
      player.surface.rotation.z = 0;
      player.wire.position.copy(player.surface.position);
    } else {
      const pose = sampleProductionTrace(time - 11.2);
      const { x, z, chassisHeading, steering, distance } = pose;
      const curveAmount = clamp01(Math.abs(pose.slipAngle) / THREE.MathUtils.degToRad(35));
      player.surface.position.set(x, 0.05, z);
      player.wire.position.copy(player.surface.position);
      player.surface.rotation.y = Math.PI + shortestAngle(Math.PI, chassisHeading)
        * smooth(11.2, 12.6, time);
      player.surface.rotation.x = pose.targetPitch;
      player.surface.rotation.z = pose.targetRoll;
      player.wire.rotation.copy(player.surface.rotation);
      player.frontWheels.forEach((wheel) => { wheel.rotation.y = steering; });
      player.wheels.forEach((wheel) => { wheel.rotation.x = distance / 0.43; });
      const markCount = Math.max(0, Math.min(
        world.driftMarkPointCount,
        Math.floor((distance - world.driftMarkStart) / world.driftMarkStep),
      ));
      world.driftMarks.forEach((mark) => { mark.geometry.setDrawRange(0, markCount); });

      const chaseBlend = smooth(11.2, 12.5, time);
      const launchKick = smooth(11.2, 11.55, time) * (1 - smooth(12.8, 14, time));
      const cameraDistance = 12.5 + launchKick * 8;
      const openingCamera = new THREE.Vector3(Math.sin(time * 0.25) * 1.4, 2.9, 11.6);
      const desiredCamera = new THREE.Vector3(
        x - Math.sin(pose.velocityHeading) * cameraDistance,
        4.2 + curveAmount * 1.1 + launchKick * 0.8,
        z - Math.cos(pose.velocityHeading) * cameraDistance,
      );
      camera.position.lerpVectors(openingCamera, desiredCamera, chaseBlend);
      const lookX = x + Math.sin(pose.velocityHeading) * 6.5;
      const lookZ = z + Math.cos(pose.velocityHeading) * 6.5;
      camera.lookAt(lookX * chaseBlend, 0.65, THREE.MathUtils.lerp(0, lookZ, chaseBlend));
      driftLab?.update(pose, distance, time, camera);

      const policeLightReveal = smooth(16.5, 17.4, time) * (1 - resolution);
      const chaseReveal = smooth(18, 20, time) * (1 - resolution);
      const policePose = sampleProductionTraceByDistance(Math.max(0, distance - 8.5));
      const policeZ = policePose.z;
      const policeX = policePose.x + Math.sin(clock * 1.8) * 0.45;
      const policeHeading = policePose.chassisHeading;
      const policeSteering = policePose.steering;
      police.surface.visible = chaseReveal > 0.001;
      police.surfaceMaterial.opacity = chaseReveal;
      police.surface.position.set(policeX, 0.05, policeZ);
      police.surface.rotation.y = policeHeading + Math.sin(clock * 1.25) * 0.08;
      police.frontWheels.forEach((wheel) => { wheel.rotation.y = policeSteering; });
      police.wheels.forEach((wheel) => { wheel.rotation.x = -policeZ / 0.43; });
      policeRed.position.set(police.surface.position.x - 0.36, 2, police.surface.position.z);
      policeBlue.position.set(police.surface.position.x + 0.36, 2, police.surface.position.z);
      const flash = Math.sin(clock * 15) > 0 ? 1 : 0.08;
      policeRed.intensity = policeLightReveal * 52 * flash;
      policeBlue.intensity = policeLightReveal * 52 * (1.08 - flash);
    }

    world.trails.forEach((trail, index) => {
      trail.material.opacity = worldReveal * (1 - resolution)
        * (0.28 + 0.28 * Math.sin(clock * 1.7 + index));
    });

    bloom.strength = 1.45 + resolution * 0.9;
    renderer.toneMappingExposure = 1.15 - resolution * 0.32;
    if (resolution > 0.001) title?.classList.add("is-visible");
    else title?.classList.remove("is-visible");
  };

  (window as Window & { __seekDriveDemo?: (seconds: number) => void }).__seekDriveDemo = (seconds) => {
    if (driftLab) driftLab.seek(seconds);
    else forcedTime = THREE.MathUtils.clamp(seconds, 0, DURATION);
  };

  frameId = requestAnimationFrame(render);

  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(frameId);
    window.removeEventListener("resize", resize);
    composer.dispose();
    renderer.dispose();
  }, { once: true });
}

type DriftLab = {
  getTime: (now: number) => number;
  seek: (seconds: number) => void;
  update: (pose: ProductionTraceSample, distance: number, time: number, camera: THREE.PerspectiveCamera) => void;
};

function createDriftLab(scene: THREE.Scene): DriftLab {
  const loopStart = 13;
  const loopEnd = 26.5;
  let anchorTime = performance.now();
  let sequenceTime = loopStart;
  let paused = false;
  let cameraMode: "production" | "top" = "production";

  const velocityArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), undefined, 5, 0x55ffe4, 0.7, 0.4);
  const chassisArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), undefined, 4, 0xff397b, 0.7, 0.4);
  const wheelArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), undefined, 3, 0xffffff, 0.6, 0.35);
  scene.add(velocityArrow, chassisArrow, wheelArrow);

  const panel = document.createElement("aside");
  panel.className = "drift-lab";
  panel.innerHTML = `
    <div class="drift-lab-heading">
      <div><span>Demo diagnostics</span><strong>Drift lab</strong></div>
      <button type="button" data-lab-action="play">Pause</button>
    </div>
    <label class="drift-lab-time">Timeline <output>13.0s</output><input type="range" min="11.2" max="28" step="0.05" value="13"></label>
    <div class="drift-lab-cameras"><button type="button" data-camera="production" aria-pressed="true">Production</button><button type="button" data-camera="top" aria-pressed="false">Top</button></div>
    <p class="drift-lab-profile">Production simulation · Aggressive profile · 120 Hz</p>
    <div class="drift-lab-legend"><span class="velocity">Velocity</span><span class="chassis">Chassis</span><span class="wheels">Wheels</span></div>
    <output class="drift-lab-telemetry"></output>
  `;
  document.body.append(panel);

  const timeline = panel.querySelector<HTMLInputElement>(".drift-lab-time input") as HTMLInputElement;
  const timelineOutput = panel.querySelector<HTMLOutputElement>(".drift-lab-time output") as HTMLOutputElement;
  const telemetry = panel.querySelector<HTMLOutputElement>(".drift-lab-telemetry") as HTMLOutputElement;
  const playButton = panel.querySelector<HTMLButtonElement>("[data-lab-action='play']") as HTMLButtonElement;
  playButton.addEventListener("click", () => {
    paused = !paused;
    if (!paused) anchorTime = performance.now();
    playButton.textContent = paused ? "Play" : "Pause";
  });
  timeline.addEventListener("input", () => {
    sequenceTime = Number(timeline.value);
    paused = true;
    playButton.textContent = "Play";
  });
  panel.querySelectorAll<HTMLButtonElement>("[data-camera]").forEach((button) => {
    button.addEventListener("click", () => {
      cameraMode = button.dataset.camera === "top" ? "top" : "production";
      panel.querySelectorAll<HTMLButtonElement>("[data-camera]").forEach((candidate) => {
        candidate.setAttribute("aria-pressed", String(candidate === button));
      });
    });
  });
  return {
    getTime(now) {
      if (!paused) {
        sequenceTime += (now - anchorTime) / 1000;
        anchorTime = now;
        if (sequenceTime > loopEnd) sequenceTime = loopStart + ((sequenceTime - loopStart) % (loopEnd - loopStart));
      }
      return sequenceTime;
    },
    seek(seconds) {
      sequenceTime = THREE.MathUtils.clamp(seconds, 11.2, 28);
      paused = true;
      playButton.textContent = "Play";
    },
    update(pose, distance, time, camera) {
      const position = new THREE.Vector3(pose.x, 0.45, pose.z);
      velocityArrow.position.copy(position);
      chassisArrow.position.copy(position).add(new THREE.Vector3(0, 0.08, 0));
      wheelArrow.position.copy(position).add(new THREE.Vector3(0, 0.16, 0));
      velocityArrow.setDirection(new THREE.Vector3(Math.sin(pose.velocityHeading), 0, Math.cos(pose.velocityHeading)));
      chassisArrow.setDirection(new THREE.Vector3(Math.sin(pose.chassisHeading), 0, Math.cos(pose.chassisHeading)));
      const wheelHeading = pose.chassisHeading + pose.steering;
      wheelArrow.setDirection(new THREE.Vector3(Math.sin(wheelHeading), 0, Math.cos(wheelHeading)));

      if (cameraMode === "top") {
        camera.up.set(0, 0, -1);
        camera.position.set(pose.x, 34, pose.z);
        camera.lookAt(pose.x, 0, pose.z);
      }

      timeline.value = time.toFixed(2);
      timelineOutput.value = `${time.toFixed(2)}s`;
      telemetry.value = [
        `distance ${distance.toFixed(1)}`,
        `slip ${THREE.MathUtils.radToDeg(pose.slipAngle).toFixed(1)}°`,
        `steer ${THREE.MathUtils.radToDeg(pose.steering).toFixed(1)}°`,
        pose.driftPhase,
      ].join(" · ");
    },
  };
}

function makeDemoCar(police: boolean, color: number) {
  const car = createCar({ police, paintColor: color });
  const surfaceMaterial = new THREE.MeshPhysicalMaterial({
    color,
    emissive: new THREE.Color(color).multiplyScalar(police ? 0.05 : 0.14),
    emissiveIntensity: 0.7,
    metalness: 0.82,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0,
  });

  car.group.updateMatrixWorld(true);
  const wire = new THREE.Group();
  const wireMaterial = new THREE.LineBasicMaterial({
    color: police ? 0xb9eaff : 0x55ffe4,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });

  car.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.material = surfaceMaterial;
    object.castShadow = false;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry, 24), wireMaterial);
    edges.matrixAutoUpdate = false;
    edges.matrix.copy(object.matrixWorld);
    wire.add(edges);
  });

  return {
    surface: car.group,
    wire,
    surfaceMaterial,
    wireMaterial,
    wheels: car.wheels,
    frontWheels: car.frontWheels,
  };
}

type LightWorld = {
  group: THREE.Group;
  materials: Array<THREE.Material & { opacity: number }>;
  trails: Array<THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>>;
  driftMarks: Array<THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>>;
  driftMarkStart: number;
  driftMarkStep: number;
  driftMarkPointCount: number;
  refreshDriftMarks: () => void;
};

function createLightWorld(): LightWorld {
  const group = new THREE.Group();
  const materials: LightWorld["materials"] = [];
  const trails: LightWorld["trails"] = [];
  const driftMarks: LightWorld["driftMarks"] = [];

  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x07110f,
    emissive: 0x061d19,
    emissiveIntensity: 0.8,
    roughness: 0.72,
    metalness: 0.22,
    transparent: true,
    opacity: 0,
  });
  materials.push(roadMaterial);
  const road = new THREE.Mesh(createRoadRibbonGeometry(12), roadMaterial);
  group.add(road);

  const cyan = new THREE.LineBasicMaterial({
    color: 0x35f7db,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const magenta = new THREE.LineBasicMaterial({
    color: 0xff326f,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  materials.push(cyan, magenta);

  for (const offset of [-6, 0, 6]) {
    const points = createRoadLinePoints(offset, 0.04);
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), offset === 0 ? magenta : cyan));
  }

  const routeDistance = PRODUCTION_DRIVE_TRACE[PRODUCTION_DRIVE_TRACE.length - 1].distance;
  for (let distance = 0; distance <= routeDistance; distance += 9) {
    const pose = sampleProductionTraceByDistance(distance);
    const normalX = Math.cos(pose.velocityHeading);
    const normalZ = -Math.sin(pose.velocityHeading);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(pose.x - normalX * 6, 0.035, pose.z - normalZ * 6),
        new THREE.Vector3(pose.x + normalX * 6, 0.035, pose.z + normalZ * 6),
      ]),
      cyan,
    );
    group.add(line);
  }

  const buildingMaterial = new THREE.MeshStandardMaterial({
    color: 0x07100f,
    emissive: 0x082521,
    emissiveIntensity: 0.45,
    roughness: 0.48,
    metalness: 0.6,
    transparent: true,
    opacity: 0,
  });
  materials.push(buildingMaterial);
  const edgeMaterial = cyan.clone();
  materials.push(edgeMaterial);

  const buildingPlacements: Array<{ x: number; z: number; radius: number }> = [];
  for (let index = 0; index < 42; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const width = 3 + (index % 4) * 0.8;
    const height = 2.4 + (index % 5) * 1.1;
    const depth = 4 + (index % 3) * 1.4;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const building = new THREE.Mesh(geometry, buildingMaterial);
    const pose = sampleProductionTraceByDistance((index / 41) * routeDistance);
    const normalX = Math.cos(pose.velocityHeading);
    const normalZ = -Math.sin(pose.velocityHeading);
    const offset = side * (28 + (index % 3) * 5);
    const candidateX = pose.x + normalX * offset;
    const candidateZ = pose.z + normalZ * offset;
    const radius = Math.hypot(width, depth) / 2;
    const routeClearance = 6 + radius + 5;
    const intersectsRoute = PRODUCTION_DRIVE_TRACE.some((routePose, routeIndex) => (
      routeIndex % 8 === 0
      && Math.hypot(candidateX - routePose.x, candidateZ - routePose.z) < routeClearance
    ));
    const intersectsBuilding = buildingPlacements.some((placed) => (
      Math.hypot(candidateX - placed.x, candidateZ - placed.z) < radius + placed.radius + 4
    ));
    if (intersectsRoute || intersectsBuilding) continue;
    buildingPlacements.push({ x: candidateX, z: candidateZ, radius });
    building.position.set(candidateX, height / 2, candidateZ);
    building.rotation.y = pose.velocityHeading;
    group.add(building);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
    edges.position.copy(building.position);
    edges.rotation.copy(building.rotation);
    group.add(edges);
  }

  for (let index = 0; index < 5; index += 1) {
    const material = new THREE.LineBasicMaterial({
      color: index % 2 ? 0xff347a : 0x47ffe1,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    const offset = -5.3 + index * 2.6;
    const geometry = new THREE.BufferGeometry().setFromPoints(
      createRoadLinePoints(offset, 0.08),
    );
    const trail = new THREE.Line(geometry, material);
    materials.push(material);
    trails.push(trail);
    group.add(trail);
  }

  const driftMarkStart = sampleProductionTrace(1.6).distance;
  const driftMarkEnd = sampleProductionTrace(10).distance;
  const driftMarkStep = 0.4;
  const driftMarkPointCount = Math.floor((driftMarkEnd - driftMarkStart) / driftMarkStep) + 1;
  for (const wheelX of [-0.86, 0.86]) {
    const material = new THREE.LineBasicMaterial({
      color: wheelX < 0 ? 0xff397b : 0x55ffe4,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setDrawRange(0, 0);
    const mark = new THREE.Line(geometry, material);
    materials.push(material);
    driftMarks.push(mark);
    group.add(mark);
  }

  const refreshDriftMarks = () => {
    driftMarks.forEach((mark, markIndex) => {
      const wheelX = markIndex === 0 ? -0.86 : 0.86;
      const points: THREE.Vector3[] = [];
      for (let index = 0; index < driftMarkPointCount; index += 1) {
        const distance = driftMarkStart + index * driftMarkStep;
        const pose = sampleProductionTraceByDistance(distance);
        const rearWheel = transformCarPoint(pose, wheelX, -1.3);
        points.push(new THREE.Vector3(rearWheel.x, 0.055, rearWheel.z));
      }
      mark.geometry.setFromPoints(points);
      mark.geometry.setDrawRange(0, 0);
    });
  };
  refreshDriftMarks();

  group.scale.z = 0.02;
  group.visible = false;
  return {
    group,
    materials,
    trails,
    driftMarks,
    driftMarkStart,
    driftMarkStep,
    driftMarkPointCount,
    refreshDriftMarks,
  };
}

type DriftPose = {
  x: number;
  z: number;
  velocityHeading: number;
  chassisHeading: number;
  steering: number;
  slipAngle: number;
};

function transformCarPoint(pose: DriftPose, localX: number, localZ: number) {
  const cosine = Math.cos(pose.chassisHeading);
  const sine = Math.sin(pose.chassisHeading);
  return {
    x: pose.x + localX * cosine + localZ * sine,
    z: pose.z - localX * sine + localZ * cosine,
  };
}

function createRoadRibbonGeometry(width: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  const stride = 6;
  const route = PRODUCTION_DRIVE_TRACE.filter((_, index) => index % stride === 0);

  route.forEach((pose, index) => {
    const normalX = Math.cos(pose.velocityHeading);
    const normalZ = -Math.sin(pose.velocityHeading);
    positions.push(
      pose.x - normalX * width / 2, 0.01, pose.z - normalZ * width / 2,
      pose.x + normalX * width / 2, 0.01, pose.z + normalZ * width / 2,
    );
    if (index === route.length - 1) return;
    const left = index * 2;
    indices.push(left, left + 1, left + 2, left + 1, left + 3, left + 2);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createRoadLinePoints(offset: number, y: number) {
  const points: THREE.Vector3[] = [];
  const stride = 8;
  PRODUCTION_DRIVE_TRACE.forEach((pose, index) => {
    if (index % stride !== 0) return;
    const normalX = Math.cos(pose.velocityHeading);
    const normalZ = -Math.sin(pose.velocityHeading);
    points.push(new THREE.Vector3(
      pose.x + normalX * offset,
      y,
      pose.z + normalZ * offset,
    ));
  });
  return points;
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function shortestAngle(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function setWorldOpacity(world: LightWorld, opacity: number) {
  for (const material of world.materials) material.opacity = opacity * 0.72;
}

function smooth(min: number, max: number, value: number) {
  return THREE.MathUtils.smoothstep(value, min, max);
}

function clamp01(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}
