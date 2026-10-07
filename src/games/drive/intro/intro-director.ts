import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { GameMapDefinition } from "../maps";
import { createCar } from "../vehicle/create-car";
import type { WorldRuntime } from "../world/types";
import { createLightDrawing, type LightDrawing } from "./light-drawing";

export type IntroPhase = "signal" | "attract" | "launch" | "idle";

type Focus = { x: number; z: number; heading: number };

/** Seconds into the full opening sequence. */
const OPENING = {
  drawStart: 0.35,
  drawEnd: 3.1,
  wireIn: [1.5, 2.5],
  developStart: 2.8,
  developEnd: 4.4,
  linesOut: [3.3, 4.6],
  cardIn: 3.7,
  cameraEnd: 4.7,
} as const;
/** Seconds into a map redraw while the menu is open. */
const REDRAW = {
  drawEnd: 1.5,
  wireIn: [0.2, 0.8],
  developStart: 1.0,
  developEnd: 2.0,
  linesOut: [1.4, 2.3],
  cameraEnd: 2.3,
} as const;
const LAUNCH_SECONDS = 1.05;
const ATTRACT_RADIUS = 13;
const ATTRACT_HEIGHT = 3.9;
const ATTRACT_SPEED = 0.075;
const ATTRACT_FOV = 46;
/** Screen-fraction shift that frames the car right of a left-side menu on wide screens. */
const WIDE_FRAMING_SHIFT_X = 0.16;
/** Portrait menus fill most of the screen; frame the car in the band beneath the card. */
const PORTRAIT_FRAMING_SHIFT_Y = 0.39;
const BLOOM_STRENGTH = 1.55;
const WIRE_COLOR = new THREE.Color(1.5, 0.42, 0.34);

export type IntroDirector = {
  readonly phase: IntroPhase;
  /** True while the opening, a redraw, a launch, or a flash is animating at full rate. */
  readonly sequencing: boolean;
  /** Plays the full opening, or a short redraw when the menu changes map. */
  play(map: GameMapDefinition, world: WorldRuntime, kind: "opening" | "redraw"): void;
  /** Jumps an in-progress opening or redraw to the developed attract shot. */
  skip(): void;
  /**
   * Flies from the attract shot into the gameplay camera. `resolveTarget` is read every
   * frame so the dive tracks a moving gameplay camera; `onDone` hands control back.
   */
  launch(resolveTarget: () => THREE.Camera, onDone: () => void): void;
  /** Ends an in-flight launch immediately, handing control back as if it had landed. */
  completeLaunch(): void;
  /** Abandons the sequence without a launch, e.g. when a debug camera takes over. */
  dismiss(): void;
  /** Advances the sequence; returns false once control has returned to gameplay cameras. */
  update(dt: number, focus: Focus): boolean;
  render(): void;
  setViewport(width: number, height: number, pixelRatio: number, layout: "wide" | "portrait" | "centered"): void;
  readonly camera: THREE.PerspectiveCamera;
  destroy(): void;
};

/**
 * Directs the drive page's opening in the Robert Abel & Associates grammar the site uses:
 * deep black → a white-hot front tracing the selected map in light → contours rising →
 * a wireframe car resolving → the lit world developing beneath the lines, all under one
 * motion-control camera move that settles into a slow attract orbit behind the menu.
 */
export function createIntroDirector(options: {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  onPhase: (phase: IntroPhase) => void;
}): IntroDirector {
  const { scene, renderer, onPhase } = options;
  const camera = new THREE.PerspectiveCamera(ATTRACT_FOV, 1, 0.1, 4000);
  const veil = createVeil();
  scene.add(veil.mesh);
  const wireCar = createWireCar();
  scene.add(wireCar.group);

  let phase: IntroPhase = "idle";
  let kind: "opening" | "redraw" = "opening";
  let time = 0;
  let clock = 0;
  let drawing: LightDrawing | null = null;
  let developAmount = 1;
  let linesOpacity = 0;
  let bloomStrength = 0;
  let attractTime = 0;
  let layout: "wide" | "portrait" | "centered" = "centered";
  const framing = { x: 0, y: 0 };
  let launchState: {
    resolveTarget: () => THREE.Camera;
    onDone: () => void;
    time: number;
    fromPosition: THREE.Vector3;
    fromFov: number;
    fromFraming: { x: number; y: number };
  } | null = null;
  let composer: { composer: EffectComposer; bloom: UnrealBloomPass } | null = null;
  const viewport = { width: 1, height: 1, pixelRatio: 1 };
  const lookAt = new THREE.Vector3();
  const openingFrom = { azimuth: 0, radius: 0, height: 0 };
  const targetPosition = new THREE.Vector3();
  const targetQuaternion = new THREE.Quaternion();
  const scratch = new THREE.Vector3();
  const lookMatrix = new THREE.Matrix4();
  const trackingQuaternion = new THREE.Quaternion();

  function setPhase(next: IntroPhase) {
    if (phase === next) return;
    phase = next;
    onPhase(next);
  }

  function timeline() {
    return kind === "opening" ? OPENING : REDRAW;
  }

  function ensureComposer() {
    if (composer) return composer;
    const effectComposer = new EffectComposer(renderer);
    effectComposer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(viewport.width, viewport.height), 0, 0.6, 0.85);
    effectComposer.addPass(bloom);
    effectComposer.addPass(new OutputPass());
    effectComposer.setPixelRatio(viewport.pixelRatio);
    effectComposer.setSize(viewport.width, viewport.height);
    composer = { composer: effectComposer, bloom };
    return composer;
  }

  function releaseComposer() {
    composer?.composer.dispose();
    composer?.bloom.dispose();
    composer = null;
  }

  function attractPose(focus: Focus, seconds: number, target: { azimuth: number; radius: number; height: number }) {
    // Start behind-left of the car and drift slowly around it.
    target.azimuth = focus.heading + Math.PI + 0.75 + seconds * ATTRACT_SPEED;
    // Portrait views are narrow; pull back so the whole car fits beneath the menu.
    const distanceScale = layout === "portrait" ? 2.1 : 1;
    target.radius = (ATTRACT_RADIUS + Math.sin(seconds * 0.21) * 0.6) * distanceScale;
    target.height = (ATTRACT_HEIGHT + Math.sin(seconds * 0.17 + 1) * 0.35) * distanceScale;
    return target;
  }

  function placeCamera(focus: Focus, pose: { azimuth: number; radius: number; height: number }, lookHeight: number) {
    camera.position.set(
      focus.x + Math.sin(pose.azimuth) * pose.radius,
      pose.height,
      focus.z + Math.cos(pose.azimuth) * pose.radius,
    );
    lookAt.set(focus.x, lookHeight, focus.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookAt);
  }

  const attract = { azimuth: 0, radius: 0, height: 0 };
  const blended = { azimuth: 0, radius: 0, height: 0 };

  function updateSequence(focus: Focus) {
    const t = timeline();
    const drawEnd = t.drawEnd;
    const drawStart = kind === "opening" ? OPENING.drawStart : 0;
    if (drawing) {
      const front = easeOutCubic(clamp01((time - drawStart) / (drawEnd - drawStart)));
      drawing.setProgress(front * (drawing.extent + 20));
      drawing.setTime(clock);
    }
    linesOpacity = 1 - smoothstep(t.linesOut[0], t.linesOut[1], time);
    drawing?.setOpacity(linesOpacity);
    developAmount = smoothstep(t.developStart, t.developEnd, time);
    veil.setVeil(1 - developAmount);
    bloomStrength = BLOOM_STRENGTH * (1 - smoothstep(t.developStart, t.linesOut[1], time));

    const wireIn = smoothstep(t.wireIn[0], t.wireIn[1], time);
    const wireOut = 1 - smoothstep(t.developStart, t.developEnd, time);
    wireCar.setPose(focus);
    wireCar.setOpacity(wireIn * wireOut);

    attractPose(focus, attractTime, attract);
    const cameraProgress = smootherstep(clamp01(time / t.cameraEnd));
    blended.azimuth = THREE.MathUtils.lerp(openingFrom.azimuth, attract.azimuth, cameraProgress);
    blended.radius = THREE.MathUtils.lerp(openingFrom.radius, attract.radius, cameraProgress);
    blended.height = THREE.MathUtils.lerp(openingFrom.height, attract.height, cameraProgress);
    placeCamera(focus, blended, THREE.MathUtils.lerp(0, 0.75, cameraProgress));
    const settle = smoothstep(t.cameraEnd * 0.55, t.cameraEnd, time);
    setFraming(attractFramingX() * settle, attractFramingY() * settle, ATTRACT_FOV);

    if (kind === "opening" && time >= OPENING.cardIn) setPhase("attract");
    if (time >= t.cameraEnd && time >= t.linesOut[1]) finishSequence();
  }

  function finishSequence() {
    drawing?.dispose();
    drawing = null;
    linesOpacity = 0;
    developAmount = 1;
    bloomStrength = 0;
    veil.setVeil(0);
    wireCar.setOpacity(0);
    // The composer stays allocated for the launch flare; it is released once driving starts.
    setPhase("attract");
  }

  function attractFramingX() { return layout === "wide" ? WIDE_FRAMING_SHIFT_X : 0; }
  function attractFramingY() { return layout === "portrait" ? PORTRAIT_FRAMING_SHIFT_Y : 0; }

  /** Shifts the image by a fraction of the viewport so the car sits beside or below the menu. */
  function setFraming(shiftX: number, shiftY: number, fov: number) {
    framing.x = shiftX;
    framing.y = shiftY;
    camera.fov = fov;
    if (Math.abs(shiftX) < 1e-4 && Math.abs(shiftY) < 1e-4) camera.clearViewOffset();
    else {
      camera.setViewOffset(
        viewport.width,
        viewport.height,
        -shiftX * viewport.width,
        -shiftY * viewport.height,
        viewport.width,
        viewport.height,
      );
    }
    camera.updateProjectionMatrix();
  }

  function updateLaunch(dt: number, focus: Focus) {
    if (!launchState) return;
    launchState.time += dt;
    const progress = clamp01(launchState.time / LAUNCH_SECONDS);

    const eased = easeInOutCubic(progress);
    const target = launchState.resolveTarget();
    target.updateMatrixWorld();
    let targetFov = ATTRACT_FOV;
    if (target instanceof THREE.PerspectiveCamera) {
      targetPosition.copy(target.position);
      targetQuaternion.copy(target.quaternion);
      targetFov = target.fov;
    } else if (target instanceof THREE.OrthographicCamera) {
      // Approximate the orthographic shot with a distant, narrow perspective camera;
      // a light flash hides the final switch to true orthographic projection.
      const forward = scratch.set(0, 0, -1).applyQuaternion(target.quaternion);
      const groundDistance = forward.y < -0.01 ? (target.position.y - 0.8) / -forward.y : 60;
      const focusPoint = target.position.clone().addScaledVector(forward, groundDistance);
      const distance = 140;
      targetPosition.copy(focusPoint).addScaledVector(forward, -distance);
      targetQuaternion.copy(target.quaternion);
      const halfHeight = (target.top - target.bottom) / 2 / target.zoom;
      targetFov = THREE.MathUtils.radToDeg(2 * Math.atan(halfHeight / distance));
    }
    // Rise first, then dive: lift the path through an arc instead of a straight dolly,
    // holding the car in frame until the final approach settles into the gameplay framing.
    camera.position.lerpVectors(launchState.fromPosition, targetPosition, eased);
    camera.position.y += Math.sin(progress * Math.PI) * 6;
    camera.up.set(0, 1, 0);
    lookAt.set(focus.x, 0.75, focus.z);
    lookMatrix.lookAt(camera.position, lookAt, camera.up);
    trackingQuaternion.setFromRotationMatrix(lookMatrix);
    camera.quaternion.slerpQuaternions(trackingQuaternion, targetQuaternion, smoothstep(0.55, 1, progress));
    const fov = Math.exp(THREE.MathUtils.lerp(Math.log(launchState.fromFov), Math.log(targetFov), eased));
    setFraming(
      THREE.MathUtils.lerp(launchState.fromFraming.x, 0, eased),
      THREE.MathUtils.lerp(launchState.fromFraming.y, 0, eased),
      fov,
    );
    // Streak exposure: bloom swells mid-flight and peaks into a flash at the hand-off.
    bloomStrength = Math.sin(progress * Math.PI) * 1.1;
    veil.setFlash(smoothstep(0.82, 1, progress) * 0.85);
    if (progress >= 1) finishLaunch();
  }

  function finishLaunch() {
    if (!launchState) return;
    const done = launchState.onDone;
    launchState = null;
    veil.fadeFlash();
    releaseComposer();
    setFraming(0, 0, ATTRACT_FOV);
    setPhase("idle");
    done();
  }

  return {
    get phase() { return phase; },
    get sequencing() {
      return drawing !== null || developAmount < 1 || launchState !== null || veil.flashing;
    },
    camera,
    play(map, world, nextKind) {
      kind = nextKind;
      time = 0;
      drawing?.dispose();
      drawing = createLightDrawing(map, world);
      scene.add(drawing.object);
      camera.far = Math.max(map.environment.cameraFar, drawing.extent * 3, 600);
      const focus = { x: world.spawnPosition.x, z: world.spawnPosition.z, heading: world.spawnHeading };
      if (nextKind === "opening") {
        attractTime = 0;
        attractPose(focus, 0, attract);
        openingFrom.azimuth = attract.azimuth - 1.25;
        openingFrom.radius = THREE.MathUtils.clamp(drawing.extent * 0.6, 55, 170);
        openingFrom.height = openingFrom.radius * 0.95;
        setPhase("signal");
      } else {
        attractPose(focus, attractTime, attract);
        openingFrom.azimuth = attract.azimuth - 0.5;
        openingFrom.radius = ATTRACT_RADIUS * 2.6;
        openingFrom.height = ATTRACT_HEIGHT * 3.5;
      }
      veil.setVeil(1);
      veil.setFlash(nextKind === "redraw" ? 0.6 : 0);
      veil.fadeFlash();
    },
    skip() {
      if (phase === "launch" || phase === "idle") return;
      if (drawing || developAmount < 1) {
        time = Math.max(time, timeline().cameraEnd, timeline().linesOut[1]);
        finishSequence();
      }
    },
    launch(resolveTarget, onDone) {
      if (phase === "idle" || phase === "launch") {
        onDone();
        return;
      }
      if (drawing) finishSequence();
      launchState = {
        resolveTarget,
        onDone,
        time: 0,
        fromPosition: camera.position.clone(),
        fromFov: camera.fov,
        fromFraming: { ...framing },
      };
      setPhase("launch");
    },
    completeLaunch() {
      finishLaunch();
    },
    dismiss() {
      if (phase === "idle") return;
      if (launchState) {
        finishLaunch();
        return;
      }
      finishSequence();
      releaseComposer();
      veil.setFlash(0);
      setFraming(0, 0, ATTRACT_FOV);
      setPhase("idle");
    },
    update(dt, focus) {
      clock += dt;
      veil.update(dt, clock);
      if (phase === "idle") return false;
      if (phase === "launch") {
        updateLaunch(dt, focus);
        return launchState !== null;
      }
      attractTime += dt;
      if (drawing || developAmount < 1) {
        time += dt;
        updateSequence(focus);
        return true;
      }
      // Developed attract orbit behind the menu.
      wireCar.setOpacity(0);
      placeCamera(focus, attractPose(focus, attractTime, attract), 0.75);
      setFraming(attractFramingX(), attractFramingY(), ATTRACT_FOV);
      return true;
    },
    render() {
      const effectsVisible = bloomStrength > 0.01;
      if (effectsVisible) {
        const { composer: effectComposer, bloom } = ensureComposer();
        bloom.strength = bloomStrength;
        effectComposer.render();
        return;
      }
      renderer.render(scene, camera);
    },
    setViewport(width, height, pixelRatio, nextLayout) {
      viewport.width = width;
      viewport.height = height;
      viewport.pixelRatio = pixelRatio;
      layout = nextLayout;
      camera.aspect = width / height;
      setFraming(framing.x, framing.y, camera.fov);
      if (composer) {
        composer.composer.setPixelRatio(pixelRatio);
        composer.composer.setSize(width, height);
      }
    },
    destroy() {
      drawing?.dispose();
      releaseComposer();
      veil.dispose();
      wireCar.dispose();
    },
  };
}

/** Full-screen black veil with film grain, plus a white flash channel. */
function createVeil() {
  const uniforms = {
    uVeil: { value: 1 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uVeil;
      uniform float uFlash;
      uniform float uTime;
      float hash(vec2 point) {
        return fract(sin(dot(point, vec2(12.9898, 78.233)) + uTime * 43.0) * 43758.5453);
      }
      void main() {
        float grain = (hash(floor(gl_FragCoord.xy * 0.5)) - 0.5) * 0.06;
        float veil = clamp(uVeil + grain * uVeil, 0.0, 1.0);
        float alpha = clamp(veil + uFlash, 0.0, 1.0);
        vec3 color = vec3(uFlash / max(alpha, 0.001));
        gl_FragColor = vec4(min(color, vec3(1.0)), alpha);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.name = "intro-veil";
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000;
  mesh.visible = true;
  let flashDecay = false;
  return {
    mesh,
    setVeil(value: number) {
      uniforms.uVeil.value = value;
      mesh.visible = uniforms.uVeil.value > 0.001 || uniforms.uFlash.value > 0.001;
    },
    setFlash(value: number) {
      flashDecay = false;
      uniforms.uFlash.value = value;
      mesh.visible = uniforms.uVeil.value > 0.001 || value > 0.001;
    },
    fadeFlash() { flashDecay = true; },
    update(dt: number, seconds: number) {
      uniforms.uTime.value = seconds % 100;
      if (flashDecay && uniforms.uFlash.value > 0) {
        uniforms.uFlash.value = Math.max(0, uniforms.uFlash.value - dt * 3.2);
        mesh.visible = uniforms.uVeil.value > 0.001 || uniforms.uFlash.value > 0.001;
      }
    },
    get flashing() { return uniforms.uFlash.value > 0.001; },
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

/** Glowing contour version of the player car, resolved at the spawn before the world develops. */
function createWireCar() {
  const car = createCar({ mergeStaticParts: false });
  car.group.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.name = "intro-wire-car";
  const material = new THREE.LineBasicMaterial({
    color: WIRE_COLOR.clone(),
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const geometries: THREE.BufferGeometry[] = [];
  car.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const edges = new THREE.EdgesGeometry(object.geometry, 24);
    edges.applyMatrix4(object.matrixWorld);
    geometries.push(edges);
    const lines = new THREE.LineSegments(edges, material);
    lines.renderOrder = 1002;
    lines.frustumCulled = false;
    group.add(lines);
  });
  car.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((entry) => entry.dispose());
  });
  group.visible = false;
  return {
    group,
    setPose(focus: Focus) {
      group.position.set(focus.x, 0.06, focus.z);
      group.rotation.set(0, focus.heading, 0);
    },
    setOpacity(opacity: number) {
      // Max blending ignores alpha, so fade by scaling the emitted color.
      material.color.copy(WIRE_COLOR).multiplyScalar(opacity);
      group.visible = opacity > 0.001;
    },
    dispose() {
      group.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      material.dispose();
    },
  };
}

function clamp01(value: number) { return Math.min(1, Math.max(0, value)); }
function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
function smootherstep(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
function easeOutCubic(t: number) { return 1 - (1 - t) ** 3; }
function easeInOutCubic(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; }
