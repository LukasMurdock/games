import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { createCar } from "./lib/driving-game/vehicle/create-car";
import "./styles/demo.css";

const DURATION = 40;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const canvas = document.querySelector<HTMLCanvasElement>("#demo-canvas");
const title = document.querySelector<HTMLElement>("#demo-title");
const replay = document.querySelector<HTMLButtonElement>("#replay-demo");
const progress = document.querySelector<HTMLElement>("#demo-progress");

if (reducedMotion.matches || !canvas) {
  title?.classList.add("is-visible");
} else {
  try {
    startDemo(canvas);
  } catch (error) {
    console.error("The real-time demo could not start.", error);
    title?.classList.add("is-visible");
  }
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
    new THREE.PlaneGeometry(180, 180),
    new THREE.MeshStandardMaterial({ color: 0x020506, roughness: 0.92, metalness: 0.08 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.025;
  scene.add(floor);

  let startedAt = performance.now();
  let frameId = 0;

  replay?.addEventListener("click", () => {
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
    let elapsed = (now - startedAt) / 1000;
    if (elapsed >= DURATION) {
      startedAt = now;
      elapsed = 0;
      title?.classList.remove("is-visible");
    }
    const normalized = elapsed / DURATION;
    updateSequence(elapsed, now / 1000);
    if (progress) progress.style.transform = `scaleX(${normalized})`;
    composer.render();
    frameId = requestAnimationFrame(render);
  };

  const updateSequence = (time: number, clock: number) => {
    const signalPhase = clamp01(time / 3.6);
    const signalIndex = Math.max(1, Math.floor(signalPhase * signalPoints.length));
    signalTrailGeometry.setDrawRange(0, signalIndex);
    signal.position.copy(signalCurve.getPoint(signalPhase));
    signal.scale.setScalar(0.75 + Math.sin(clock * 18) * 0.25);
    signal.visible = time < 5.1;
    signalTrailMaterial.opacity = 0.95 * (1 - smooth(4.1, 6.5, time));

    const wireReveal = smooth(2.3, 5.4, time) * (1 - smooth(7.1, 9.2, time));
    player.wireMaterial.opacity = wireReveal;
    player.wire.visible = wireReveal > 0.001;

    const surfaceReveal = smooth(4.7, 8.2, time);
    player.surfaceMaterial.opacity = surfaceReveal;
    player.surface.visible = surfaceReveal > 0.001;
    player.surface.rotation.y = time < 8
      ? Math.sin(time * 0.42) * 0.28
      : Math.PI * smooth(8, 10.5, time);
    player.wire.rotation.copy(player.surface.rotation);

    const worldReveal = smooth(8.2, 12.3, time);
    setWorldOpacity(world, worldReveal * (1 - smooth(28.3, 31.2, time)));
    world.group.visible = worldReveal > 0.001;
    world.group.scale.z = 0.02 + worldReveal * 0.98;

    if (time < 8.2) {
      const orbit = smooth(3, 8, time);
      camera.position.set(Math.sin(time * 0.25) * orbit * 1.4, 3.4 - orbit * 0.5, 13 - orbit * 1.4);
      camera.lookAt(0, 0.75, 0);
      player.surface.position.set(0, 0.05, 0);
      player.wire.position.copy(player.surface.position);
    } else {
      const travel = smooth(8.2, 27.8, time);
      const drift = smooth(16.2, 20, time) * (1 - smooth(24.2, 27.3, time));
      const driftAngle = smooth(16.2, 25.7, time) * Math.PI;
      const x = Math.sin(driftAngle) * 7.4 * drift;
      const z = -travel * 68;
      player.surface.position.set(x, 0.05, z);
      player.wire.position.copy(player.surface.position);
      player.surface.rotation.y = Math.PI + Math.sin(driftAngle) * drift * 0.72;
      player.wire.rotation.copy(player.surface.rotation);

      const chaseBlend = smooth(8.2, 11.5, time);
      const openingCamera = new THREE.Vector3(Math.sin(time * 0.25) * 1.4, 2.9, 11.6);
      const desiredCamera = new THREE.Vector3(x * 0.36, 4.2 + drift * 1.1, z + 12.5);
      camera.position.lerpVectors(openingCamera, desiredCamera, chaseBlend);
      camera.lookAt(x * 0.82 * chaseBlend, 0.65, THREE.MathUtils.lerp(0, z - 6.5, chaseBlend));

      const chaseReveal = smooth(20.1, 22.1, time) * (1 - smooth(28.1, 30.2, time));
      police.surface.visible = chaseReveal > 0.001;
      police.surfaceMaterial.opacity = chaseReveal;
      police.surface.position.set(x + Math.sin(clock * 1.8) * 1.7, 0.05, z + 8.5);
      police.surface.rotation.y = Math.PI + Math.sin(clock * 1.25) * 0.18;
      policeRed.position.set(police.surface.position.x - 0.36, 2, police.surface.position.z);
      policeBlue.position.set(police.surface.position.x + 0.36, 2, police.surface.position.z);
      const flash = Math.sin(clock * 15) > 0 ? 1 : 0.08;
      policeRed.intensity = chaseReveal * 52 * flash;
      policeBlue.intensity = chaseReveal * 52 * (1.08 - flash);
    }

    world.trails.forEach((trail, index) => {
      trail.material.opacity = worldReveal * (0.28 + 0.28 * Math.sin(clock * 1.7 + index));
      trail.position.z = ((clock * (5 + index * 0.8)) % 70) - 70;
    });

    const resolution = smooth(28.4, 31.1, time);
    bloom.strength = 1.45 + resolution * 0.9;
    renderer.toneMappingExposure = 1.15 - resolution * 0.32;
    if (resolution > 0.38) title?.classList.add("is-visible");
    else title?.classList.remove("is-visible");
  };

  frameId = requestAnimationFrame(render);

  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(frameId);
    window.removeEventListener("resize", resize);
    composer.dispose();
    renderer.dispose();
  }, { once: true });
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

  return { surface: car.group, wire, surfaceMaterial, wireMaterial };
}

type LightWorld = {
  group: THREE.Group;
  materials: Array<THREE.Material & { opacity: number }>;
  trails: Array<THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>>;
};

function createLightWorld(): LightWorld {
  const group = new THREE.Group();
  group.position.z = 3;
  const materials: LightWorld["materials"] = [];
  const trails: LightWorld["trails"] = [];

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
  const road = new THREE.Mesh(new THREE.PlaneGeometry(12, 150), roadMaterial);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, -62);
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

  for (const x of [-6, 0, 6]) {
    const points = [new THREE.Vector3(x, 0.04, 10), new THREE.Vector3(x, 0.04, -135)];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), x === 0 ? magenta : cyan));
  }

  for (let z = 6; z > -135; z -= 9) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-6, 0.035, z),
        new THREE.Vector3(6, 0.035, z),
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

  for (let index = 0; index < 24; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const width = 3 + (index % 4) * 0.8;
    const height = 2.4 + (index % 5) * 1.1;
    const depth = 4 + (index % 3) * 1.4;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const building = new THREE.Mesh(geometry, buildingMaterial);
    building.position.set(side * (9 + (index % 3) * 3.2), height / 2, -index * 5.7);
    group.add(building);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
    edges.position.copy(building.position);
    group.add(edges);
  }

  for (let index = 0; index < 5; index += 1) {
    const material = new THREE.LineBasicMaterial({
      color: index % 2 ? 0xff347a : 0x47ffe1,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-5.3 + index * 2.6, 0.08, 6),
      new THREE.Vector3(-5.3 + index * 2.6, 0.08, -42),
    ]);
    const trail = new THREE.Line(geometry, material);
    materials.push(material);
    trails.push(trail);
    group.add(trail);
  }

  group.scale.z = 0.02;
  group.visible = false;
  return { group, materials, trails };
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
