import * as THREE from "three";
import type { BuildingDefinition } from "../maps/types";
import type { Obstacle } from "./types";

const UP = new THREE.Vector3(0, 1, 0);

export function addBuilding(
  scene: THREE.Object3D,
  obstacles: Obstacle[],
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  color: number,
  style: BuildingDefinition["style"] = "standard",
  rotation = 0,
) {
  const group = new THREE.Group();
  const concreteMaterial = new THREE.MeshStandardMaterial({ color: 0xaaa58a, roughness: 1, flatShading: true });
  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(width + 1.7, 0.16, depth + 1.7),
    concreteMaterial,
  );
  foundation.position.y = 0.08;
  foundation.receiveShadow = true;
  group.add(foundation);

  const finishBuilding = () => {
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    scene.add(group);
    const extentX = Math.abs(Math.cos(rotation)) * width / 2 + Math.abs(Math.sin(rotation)) * depth / 2;
    const extentZ = Math.abs(Math.sin(rotation)) * width / 2 + Math.abs(Math.cos(rotation)) * depth / 2;
    obstacles.push({
      kind: "building",
      minX: x - extentX,
      maxX: x + extentX,
      minZ: z - extentZ,
      maxZ: z + extentZ,
      orientedBox: rotation === 0 ? undefined : {
        x,
        z,
        halfWidth: width / 2,
        halfDepth: depth / 2,
        rotation,
      },
      resetsCar: true,
    });
  };

  if (style === "hangar") {
    addHangarMeshes(group, width, depth, height, color);
    finishBuilding();
    return;
  }
  if (style === "tower") {
    addTowerMeshes(group, width, depth, height, color);
    finishBuilding();
    return;
  }
  if (style === "freight") {
    addFreightMeshes(group, width, depth, height, color);
    finishBuilding();
    return;
  }

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }),
  );
  body.position.y = height / 2 + 0.16;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const baseBand = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.06, 0.48, depth + 0.06),
    new THREE.MeshStandardMaterial({ color: 0x655f50, roughness: 1, flatShading: true }),
  );
  baseBand.position.y = 0.4;
  baseBand.castShadow = true;
  group.add(baseBand);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.75, 0.48, depth + 0.75),
    new THREE.MeshStandardMaterial({ color: 0x424139, roughness: 1, flatShading: true }),
  );
  roof.position.y = height + 0.4;
  roof.castShadow = true;
  group.add(roof);

  if (height >= 13) {
    const roofUnit = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.85, 2),
      new THREE.MeshStandardMaterial({ color: 0x777363, roughness: 1, flatShading: true }),
    );
    roofUnit.position.set(width * 0.18, height + 1.05, -depth * 0.16);
    roofUnit.castShadow = true;
    group.add(roofUnit);
  }

  const windowMaterial = new THREE.MeshBasicMaterial({ color: 0x26383a });
  const windows: Array<[number, number, number, number]> = [];
  for (let y = 2.3; y < height - 0.7; y += 3.05) {
    for (let offset = -width / 2 + 1.8; offset < width / 2 - 0.45; offset += 3) {
      windows.push([offset, y + 0.16, depth / 2 + 0.011, 0]);
      windows.push([-offset, y + 0.16, -depth / 2 - 0.011, Math.PI]);
    }
    for (let offset = -depth / 2 + 1.8; offset < depth / 2 - 0.45; offset += 3) {
      windows.push([width / 2 + 0.011, y + 0.16, -offset, Math.PI / 2]);
      windows.push([-width / 2 - 0.011, y + 0.16, offset, -Math.PI / 2]);
    }
  }
  const windowInstances = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.45, 1.35),
    windowMaterial,
    windows.length,
  );
  const windowMatrix = new THREE.Matrix4();
  const windowQuaternion = new THREE.Quaternion();
  windows.forEach(([px, py, pz, rotationY], index) => {
    windowQuaternion.setFromAxisAngle(UP, rotationY);
    windowMatrix.compose(
      new THREE.Vector3(px, py, pz),
      windowQuaternion,
      new THREE.Vector3(1, 1, 1),
    );
    windowInstances.setMatrixAt(index, windowMatrix);
  });
  group.add(windowInstances);

  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 2.2), windowMaterial);
  door.position.set(0, 1.42, depth / 2 + 0.014);
  group.add(door);

  if ((Math.abs(x + z) / 15) % 2 < 1) {
    const awningColors = [0xf3e7bd, 0xd65a3b];
    for (let stripe = 0; stripe < 4; stripe++) {
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.12, 0.85),
        new THREE.MeshBasicMaterial({ color: awningColors[stripe % 2] }),
      );
      awning.position.set((stripe - 1.5) * 0.72, 2.55, depth / 2 + 0.38);
      awning.rotation.x = -0.18;
      group.add(awning);
    }
  }

  finishBuilding();
}

function addHangarMeshes(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  color: number,
) {
  const roofRise = Math.min(2.35, height * 0.3);
  const wallHeight = height - roofRise;
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, wallHeight, depth), bodyMaterial);
  body.position.y = wallHeight / 2 + 0.16;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const ridgeRunsAlongZ = depth >= width;
  const roofGeometry = createGableRoofGeometry(
    ridgeRunsAlongZ ? width : depth,
    ridgeRunsAlongZ ? depth : width,
    roofRise,
  );
  const roof = new THREE.Mesh(
    roofGeometry,
    new THREE.MeshStandardMaterial({ color: 0x454942, roughness: 1, flatShading: true }),
  );
  roof.position.y = wallHeight + 0.16;
  if (!ridgeRunsAlongZ) roof.rotation.y = Math.PI / 2;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const doorMaterial = new THREE.MeshBasicMaterial({ color: 0x263537 });
  const doorWidth = (ridgeRunsAlongZ ? width : depth) * 0.72;
  const doorHeight = wallHeight * 0.7;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(doorWidth, doorHeight), doorMaterial);
  door.position.y = doorHeight / 2 + 0.17;
  if (ridgeRunsAlongZ) {
    door.position.z = depth / 2 + 0.012;
  } else {
    door.position.x = width / 2 + 0.012;
    door.rotation.y = Math.PI / 2;
  }
  group.add(door);

  const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xc6b987 });
  for (let stripe = -1; stripe <= 1; stripe++) {
    const divider = new THREE.Mesh(new THREE.PlaneGeometry(0.1, doorHeight), stripeMaterial);
    divider.position.copy(door.position);
    divider.position.y = door.position.y;
    if (ridgeRunsAlongZ) divider.position.x = stripe * doorWidth / 3;
    else divider.position.z = stripe * doorWidth / 3;
    divider.rotation.copy(door.rotation);
    if (ridgeRunsAlongZ) divider.position.z += 0.002;
    else divider.position.x += 0.002;
    group.add(divider);
  }
}

function addFreightMeshes(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  color: number,
) {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }),
  );
  body.position.y = height / 2 + 0.16;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.65, 0.34, depth + 0.65),
    new THREE.MeshStandardMaterial({ color: 0x3f4540, roughness: 1, flatShading: true }),
  );
  roof.position.y = height + 0.33;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const loadingSideRunsAlongZ = depth >= width;
  const sideLength = loadingSideRunsAlongZ ? depth : width;
  const bayCount = Math.max(2, Math.floor(sideLength / 7));
  const baySpacing = sideLength / bayCount;
  const doorWidth = Math.min(3.4, baySpacing * 0.62);
  const doorHeight = Math.min(3, height * 0.58);
  const instanceCount = bayCount * 2;
  const doors = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(doorWidth, doorHeight),
    new THREE.MeshBasicMaterial({ color: 0x293938 }),
    instanceCount,
  );
  const headers = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(doorWidth + 0.35, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xd2c497 }),
    instanceCount,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  let instance = 0;
  for (let bay = 0; bay < bayCount; bay++) {
    const offset = -sideLength / 2 + baySpacing * (bay + 0.5);
    for (const side of [-1, 1]) {
      let rotation = 0;
      if (loadingSideRunsAlongZ) rotation = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      else if (side < 0) rotation = Math.PI;
      const x = loadingSideRunsAlongZ ? side * (width / 2 + 0.012) : offset;
      const z = loadingSideRunsAlongZ ? offset : side * (depth / 2 + 0.012);
      quaternion.setFromAxisAngle(UP, rotation);
      matrix.compose(
        new THREE.Vector3(x, doorHeight / 2 + 0.17, z),
        quaternion,
        new THREE.Vector3(1, 1, 1),
      );
      doors.setMatrixAt(instance, matrix);
      matrix.compose(
        new THREE.Vector3(x, doorHeight + 0.32, z),
        quaternion,
        new THREE.Vector3(1, 1, 1),
      );
      headers.setMatrixAt(instance, matrix);
      instance++;
    }
  }
  doors.instanceMatrix.needsUpdate = true;
  headers.instanceMatrix.needsUpdate = true;
  doors.computeBoundingSphere();
  headers.computeBoundingSphere();
  group.add(doors, headers);
}

function createGableRoofGeometry(width: number, depth: number, rise: number) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const positions = new Float32Array([
    -halfWidth, 0, -halfDepth,
    halfWidth, 0, -halfDepth,
    0, rise, -halfDepth,
    -halfWidth, 0, halfDepth,
    halfWidth, 0, halfDepth,
    0, rise, halfDepth,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([
    0, 2, 1,
    3, 4, 5,
    0, 5, 2, 0, 3, 5,
    2, 4, 1, 2, 5, 4,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function addTowerMeshes(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  color: number,
) {
  const baseHeight = 3.1;
  const cabHeight = 3.2;
  const shaftTop = height - cabHeight;
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x26383a, roughness: 0.8, flatShading: true });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x48463d, roughness: 1, flatShading: true });

  const base = new THREE.Mesh(new THREE.BoxGeometry(width, baseHeight, depth), bodyMaterial);
  base.position.y = baseHeight / 2 + 0.16;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const shaft = new THREE.Mesh(new THREE.BoxGeometry(width * 0.48, shaftTop - baseHeight, depth * 0.48), bodyMaterial);
  shaft.position.y = baseHeight + (shaftTop - baseHeight) / 2 + 0.16;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  group.add(shaft);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, cabHeight, depth * 0.88), darkMaterial);
  cab.position.y = shaftTop + cabHeight / 2 + 0.16;
  cab.castShadow = true;
  group.add(cab);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(width, 0.48, depth), roofMaterial);
  roof.position.y = height + 0.4;
  roof.castShadow = true;
  group.add(roof);
}

