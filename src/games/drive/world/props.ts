import * as THREE from "three";
import type { SignDefinition } from "../maps/types";
import type { Obstacle } from "./types";

type InstancedPart = {
  geometry: THREE.BufferGeometry;
  color: number;
  basic?: boolean;
  /** Local transform of the part relative to the prop origin. */
  position: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
  /** Per-instance brightness jitter, so repeated props do not read as stamped copies. */
  tintJitter?: number;
};

/** Builds one instanced mesh per part and places every part for every prop instance. */
function addInstancedProp(
  scene: THREE.Object3D,
  parts: readonly InstancedPart[],
  placements: readonly { x: number; z: number; yaw: number; scale: number; seed: number }[],
) {
  if (placements.length === 0) return;
  const matrix = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const placement = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const tint = new THREE.Color();
  for (const part of parts) {
    const mesh = new THREE.InstancedMesh(
      part.geometry,
      part.basic
        ? new THREE.MeshBasicMaterial({ color: part.color })
        : new THREE.MeshStandardMaterial({ color: part.color, roughness: 1, flatShading: true }),
      placements.length,
    );
    local.compose(
      new THREE.Vector3(...part.position),
      quaternion.setFromEuler(euler.set(...(part.rotation ?? [0, 0, 0]))),
      new THREE.Vector3(...(part.scale ?? [1, 1, 1])),
    );
    placements.forEach((entry, index) => {
      placement.compose(
        new THREE.Vector3(entry.x, 0, entry.z),
        quaternion.setFromAxisAngle(UP, entry.yaw),
        new THREE.Vector3(entry.scale, entry.scale, entry.scale),
      );
      mesh.setMatrixAt(index, matrix.multiplyMatrices(placement, local));
      if (part.tintJitter) {
        const jitter = 1 + (hash(entry.seed, part.position[1]) - 0.5) * part.tintJitter;
        mesh.setColorAt(index, tint.setScalar(jitter));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = !part.basic;
    mesh.receiveShadow = !part.basic;
    scene.add(mesh);
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/** Conifers, broad deciduous crowns, and narrow poplars, chosen deterministically per position. */
export function addTreeBatch(
  scene: THREE.Object3D,
  obstacles: Obstacle[],
  points: readonly { x: number; z: number }[],
) {
  if (points.length === 0) return;
  const species: Array<Array<{ x: number; z: number; yaw: number; scale: number; seed: number }>> = [[], [], []];
  points.forEach((point) => {
    const seed = hash(point.x, point.z);
    const kind = seed < 0.45 ? 0 : seed < 0.82 ? 1 : 2;
    species[kind].push({
      x: point.x,
      z: point.z,
      yaw: deterministicRotation(point.x, point.z),
      scale: 0.88 + hash(point.z, point.x) * 0.3,
      seed: seed * 1000,
    });
    obstacles.push({
      kind: "tree",
      minX: point.x - 0.8,
      maxX: point.x + 0.8,
      minZ: point.z - 0.8,
      maxZ: point.z + 0.8,
      resetsCar: true,
    });
  });
  const trunk = new THREE.CylinderGeometry(0.3, 0.46, 2.5, 5);
  addInstancedProp(scene, [
    { geometry: trunk, color: 0x65503a, position: [0, 1.25, 0] },
    { geometry: new THREE.ConeGeometry(2.35, 3.5, 6), color: 0x344d20, position: [0, 2.75, 0], tintJitter: 0.25 },
    { geometry: new THREE.ConeGeometry(1.85, 3.25, 6), color: 0x486421, position: [0, 4.15, 0], tintJitter: 0.25 },
    { geometry: new THREE.ConeGeometry(1.3, 2.8, 6), color: 0x5f7625, position: [0, 5.45, 0], tintJitter: 0.25 },
  ], species[0]);
  const crown = new THREE.IcosahedronGeometry(1, 0);
  addInstancedProp(scene, [
    { geometry: trunk, color: 0x6b5440, position: [0, 1.4, 0], scale: [0.85, 1.15, 0.85] },
    { geometry: crown, color: 0x55752a, position: [0, 4.1, 0], scale: [2.3, 1.9, 2.3], tintJitter: 0.3 },
    { geometry: crown, color: 0x678a31, position: [0.95, 4.9, 0.4], scale: [1.5, 1.3, 1.5], tintJitter: 0.3 },
    { geometry: crown, color: 0x4b6a25, position: [-0.8, 4.6, -0.6], scale: [1.6, 1.4, 1.6], tintJitter: 0.3 },
  ], species[1]);
  addInstancedProp(scene, [
    { geometry: trunk, color: 0x5d4a37, position: [0, 0.9, 0], scale: [0.7, 0.75, 0.7] },
    { geometry: crown, color: 0x4f6e26, position: [0, 4.4, 0], scale: [1.15, 3.6, 1.15], tintJitter: 0.25 },
    { geometry: crown, color: 0x5f7f2c, position: [0, 6.4, 0], scale: [0.8, 1.9, 0.8], tintJitter: 0.25 },
  ], species[2]);
}

export function addStreetlightBatch(
  scene: THREE.Object3D,
  obstacles: Obstacle[],
  points: readonly { x: number; z: number }[],
) {
  if (points.length === 0) return;
  const placements = points.map((point) => ({
    x: point.x,
    z: point.z,
    yaw: ((Math.abs(point.x * 7 + point.z * 11) % 4) * Math.PI) / 2,
    scale: 1,
    seed: 0,
  }));
  const armRise = Math.atan2(0.35, 0.7);
  addInstancedProp(scene, [
    { geometry: new THREE.CylinderGeometry(0.34, 0.4, 0.42, 8), color: 0x52554e, position: [0, 0.21, 0] },
    { geometry: new THREE.CylinderGeometry(0.08, 0.14, 5.1, 6), color: 0x343832, position: [0, 2.9, 0] },
    // Rising bracket, then a horizontal arm out to the lamp head.
    {
      geometry: new THREE.BoxGeometry(0.78, 0.1, 0.1),
      color: 0x343832,
      position: [0.33, 5.45, 0],
      rotation: [0, 0, armRise],
    },
    { geometry: new THREE.BoxGeometry(0.95, 0.1, 0.1), color: 0x343832, position: [1.12, 5.62, 0] },
    { geometry: new THREE.BoxGeometry(0.78, 0.2, 0.42), color: 0x2c2f2b, position: [1.5, 5.55, 0] },
    { geometry: new THREE.BoxGeometry(0.6, 0.04, 0.32), color: 0xfbe39a, basic: true, position: [1.5, 5.43, 0] },
  ], placements);
  points.forEach((point) => {
    obstacles.push({
      kind: "streetlight",
      minX: point.x - 0.32,
      maxX: point.x + 0.32,
      minZ: point.z - 0.32,
      maxZ: point.z + 0.32,
      resetsCar: true,
    });
  });
}

export function addSignBatch(
  scene: THREE.Object3D,
  obstacles: Obstacle[],
  signs: readonly SignDefinition[],
) {
  if (signs.length === 0) return;
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x3b4039, roughness: 1, flatShading: true });
  const posts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.17, 2.7, 5),
    postMaterial,
    signs.length,
  );
  const panels = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 0.22),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }),
    signs.length,
  );
  const iconCount = signs.reduce((count, sign) => count + signIcon(sign.kind ?? "service").length * 2, 0);
  const icons = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x202721 }),
    iconCount,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const iconQuaternion = new THREE.Quaternion();
  let iconIndex = 0;
  signs.forEach((sign, index) => {
    const kind = sign.kind ?? "service";
    const [panelWidth, panelHeight] = signPanelDimensions(kind);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sign.rotation ?? 0);
    matrix.compose(new THREE.Vector3(sign.x, 1.35, sign.z), quaternion, new THREE.Vector3(1, 1, 1));
    posts.setMatrixAt(index, matrix);
    matrix.compose(
      new THREE.Vector3(sign.x, 3, sign.z),
      quaternion,
      new THREE.Vector3(panelWidth, panelHeight, 1),
    );
    panels.setMatrixAt(index, matrix);
    panels.setColorAt(index, new THREE.Color(sign.color ?? 0xd4b35e).lerp(new THREE.Color(0xffffff), 0.1));
    for (const component of signIcon(kind)) {
      for (const face of [-1, 1]) {
        const localX = component.x * panelWidth;
        const position = new THREE.Vector3(localX, component.y * panelHeight, face * 0.135)
          .applyQuaternion(quaternion)
          .add(new THREE.Vector3(sign.x, 3, sign.z));
        iconQuaternion.copy(quaternion).multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), component.rotation ?? 0),
        );
        matrix.compose(
          position,
          iconQuaternion,
          new THREE.Vector3(component.width * panelWidth, component.height * panelHeight, 0.035),
        );
        icons.setMatrixAt(iconIndex++, matrix);
      }
    }
    obstacles.push({
      kind: "sign",
      minX: sign.x - 0.24,
      maxX: sign.x + 0.24,
      minZ: sign.z - 0.24,
      maxZ: sign.z + 0.24,
      resetsCar: true,
    });
  });
  [posts, panels, icons].forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    scene.add(mesh);
  });
}

type SignKind = NonNullable<SignDefinition["kind"]>;
type SignIconComponent = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

function signPanelDimensions(kind: SignKind): readonly [number, number] {
  return ({
    freight: [3.8, 1],
    service: [2.8, 1.4],
    civic: [2.5, 1.7],
    retail: [3.3, 1.35],
    construction: [3.1, 1.1],
    container: [4, 0.95],
  } as const)[kind];
}

function signIcon(kind: SignKind): readonly SignIconComponent[] {
  const icons: Record<SignKind, readonly SignIconComponent[]> = {
    freight: [
      { x: -0.24, y: 0, width: 0.17, height: 0.48 },
      { x: 0, y: 0, width: 0.17, height: 0.48 },
      { x: 0.24, y: 0, width: 0.17, height: 0.48 },
    ],
    service: [
      { x: 0, y: 0, width: 0.16, height: 0.66 },
      { x: 0, y: 0, width: 0.34, height: 0.16 },
    ],
    civic: [
      { x: 0, y: 0.25, width: 0.72, height: 0.12 },
      { x: -0.24, y: -0.08, width: 0.12, height: 0.48 },
      { x: 0, y: -0.08, width: 0.12, height: 0.48 },
      { x: 0.24, y: -0.08, width: 0.12, height: 0.48 },
    ],
    retail: [
      { x: 0, y: 0.2, width: 0.72, height: 0.14 },
      { x: -0.23, y: -0.12, width: 0.13, height: 0.42 },
      { x: 0, y: -0.12, width: 0.13, height: 0.42 },
      { x: 0.23, y: -0.12, width: 0.13, height: 0.42 },
    ],
    construction: [
      { x: 0, y: 0, width: 0.12, height: 0.72, rotation: Math.PI / 4 },
      { x: 0, y: 0, width: 0.12, height: 0.72, rotation: -Math.PI / 4 },
      { x: 0, y: -0.32, width: 0.58, height: 0.1 },
    ],
    container: [
      { x: -0.18, y: 0.18, width: 0.28, height: 0.22 },
      { x: 0.18, y: 0.18, width: 0.28, height: 0.22 },
      { x: -0.18, y: -0.18, width: 0.28, height: 0.22 },
      { x: 0.18, y: -0.18, width: 0.28, height: 0.22 },
    ],
  };
  return icons[kind];
}

export function addBarrierBatch(
  scene: THREE.Object3D,
  obstacles: Obstacle[],
  points: readonly { x: number; z: number }[],
) {
  if (points.length === 0) return;
  const barriers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.8, 0.75, 0.7),
    new THREE.MeshStandardMaterial({ color: 0xf1e8c9, roughness: 1, flatShading: true }),
    points.length,
  );
  const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xd85739 });
  const stripes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.62, 0.76), stripeMaterial, points.length * 2);
  const matrix = new THREE.Matrix4();
  const stripeQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.42));
  points.forEach((point, index) => {
    matrix.makeTranslation(point.x, 0.42, point.z);
    barriers.setMatrixAt(index, matrix);
    for (const [stripeIndex, offset] of [-0.72, 0.72].entries()) {
      matrix.compose(
        new THREE.Vector3(point.x + offset, 0.42, point.z + 0.351),
        stripeQuaternion,
        new THREE.Vector3(1, 1, 1),
      );
      stripes.setMatrixAt(index * 2 + stripeIndex, matrix);
    }
    obstacles.push({
      kind: "barrier",
      minX: point.x - 1.4,
      maxX: point.x + 1.4,
      minZ: point.z - 0.35,
      maxZ: point.z + 0.35,
      resetsCar: true,
    });
  });
  barriers.instanceMatrix.needsUpdate = true;
  stripes.instanceMatrix.needsUpdate = true;
  barriers.computeBoundingSphere();
  stripes.computeBoundingSphere();
  barriers.castShadow = true;
  scene.add(barriers, stripes);
}

function deterministicRotation(x: number, z: number) {
  return Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * Math.PI * 2;
}

function hash(x: number, z: number) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
}
