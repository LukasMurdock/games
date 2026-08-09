import * as THREE from "three";
import type { SignDefinition } from "../maps/types";
import type { Obstacle } from "./types";

export function addTreeBatch(
  scene: THREE.Object3D,
  obstacles: Obstacle[],
  points: readonly { x: number; z: number }[],
) {
  if (points.length === 0) return;
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.34, 0.48, 2.5, 5),
    new THREE.MeshStandardMaterial({ color: 0x65503a, roughness: 1, flatShading: true }),
    points.length,
  );
  const foliageColors = [0x344d20, 0x486421, 0x5f7625];
  const layers = [
    { radius: 2.35, height: 3.5, y: 2.75 },
    { radius: 1.85, height: 3.25, y: 4.15 },
    { radius: 1.3, height: 2.8, y: 5.45 },
  ];
  const foliage = layers.map((layer, index) => new THREE.InstancedMesh(
    new THREE.ConeGeometry(layer.radius, layer.height, 5),
    new THREE.MeshStandardMaterial({ color: foliageColors[index], roughness: 1, flatShading: true }),
    points.length,
  ));
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  points.forEach((point, index) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), deterministicRotation(point.x, point.z));
    matrix.compose(new THREE.Vector3(point.x, 1.25, point.z), quaternion, new THREE.Vector3(1, 1, 1));
    trunks.setMatrixAt(index, matrix);
    layers.forEach((layer, layerIndex) => {
      matrix.compose(
        new THREE.Vector3(point.x, layer.y, point.z),
        quaternion,
        new THREE.Vector3(1, 1, 1),
      );
      foliage[layerIndex].setMatrixAt(index, matrix);
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
  [trunks, ...foliage].forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    scene.add(mesh);
  });
}

export function addStreetlightBatch(
  scene: THREE.Object3D,
  obstacles: Obstacle[],
  points: readonly { x: number; z: number }[],
) {
  if (points.length === 0) return;
  const metal = new THREE.MeshStandardMaterial({ color: 0x343832, roughness: 1, flatShading: true });
  const definitions = [
    { geometry: new THREE.BoxGeometry(0.7, 0.28, 0.7), material: metal, x: 0, y: 0.14 },
    { geometry: new THREE.CylinderGeometry(0.11, 0.16, 5.2, 5), material: metal, x: 0, y: 2.7 },
    { geometry: new THREE.BoxGeometry(1.35, 0.16, 0.16), material: metal, x: 0.58, y: 5.23 },
    {
      geometry: new THREE.BoxGeometry(0.62, 0.18, 0.42),
      material: new THREE.MeshBasicMaterial({ color: 0xf2d77f }),
      x: 1.16,
      y: 5.1,
    },
  ];
  const meshes = definitions.map((definition) => new THREE.InstancedMesh(
    definition.geometry,
    definition.material,
    points.length,
  ));
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  points.forEach((point, index) => {
    const heading = ((Math.abs(point.x * 7 + point.z * 11) % 4) * Math.PI) / 2;
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    definitions.forEach((definition, partIndex) => {
      matrix.compose(
        new THREE.Vector3(
          point.x + Math.cos(heading) * definition.x,
          definition.y,
          point.z - Math.sin(heading) * definition.x,
        ),
        quaternion,
        new THREE.Vector3(1, 1, 1),
      );
      meshes[partIndex].setMatrixAt(index, matrix);
    });
    obstacles.push({
      kind: "streetlight",
      minX: point.x - 0.32,
      maxX: point.x + 0.32,
      minZ: point.z - 0.32,
      maxZ: point.z + 0.32,
      resetsCar: true,
    });
  });
  meshes.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    scene.add(mesh);
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
