import * as THREE from "three";

function createTaperedBoxGeometry(
  bottomHalfWidth: number,
  topHalfWidth: number,
  bottomMinZ: number,
  bottomMaxZ: number,
  topMinZ: number,
  topMaxZ: number,
  height: number,
) {
  const positions = [
    -bottomHalfWidth, 0, bottomMinZ, bottomHalfWidth, 0, bottomMinZ,
    bottomHalfWidth, 0, bottomMaxZ, -bottomHalfWidth, 0, bottomMaxZ,
    -topHalfWidth, height, topMinZ, topHalfWidth, height, topMinZ,
    topHalfWidth, height, topMaxZ, -topHalfWidth, height, topMaxZ,
  ];
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 7, 6, 4, 6, 5,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export type CarAppearance = {
  paintColor?: number;
  police?: boolean;
};

export function createCar(appearance: CarAppearance = {}) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: appearance.paintColor ?? (appearance.police ? 0x18252d : 0xd94432),
    roughness: 0.82,
    metalness: 0,
    flatShading: true,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171918, roughness: 1, flatShading: true });
  const rim = new THREE.MeshStandardMaterial({ color: 0xaaa58f, roughness: 0.9, flatShading: true });
  const glass = new THREE.MeshStandardMaterial({ color: 0x263b3c, roughness: 0.72, flatShading: true });

  const body = new THREE.Mesh(
    createTaperedBoxGeometry(1.08, 1.02, -2.05, 2.05, -1.95, 1.88, 0.68),
    paint,
  );
  body.position.y = 0.24;
  group.add(body);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.16, 1.2), paint);
  hood.position.set(0, 0.98, 1.28);
  group.add(hood);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.14, 0.72), paint);
  trunk.position.set(0, 0.94, -1.62);
  group.add(trunk);

  const cabin = new THREE.Mesh(
    createTaperedBoxGeometry(0.88, 0.69, -1.02, 0.65, -0.72, 0.34, 0.62),
    glass,
  );
  cabin.position.y = 0.97;
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.14, 1.02), paint);
  roof.position.set(0, 1.62, -0.2);
  group.add(roof);

  for (const z of [-2.07, 2.07]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.18, 0.16), dark);
    bumper.position.set(0, 0.48, z);
    group.add(bumper);
  }
  for (const x of [-1.09, 1.09]) {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.18, 2.65), dark);
    sill.position.set(x, 0.43, 0);
    group.add(sill);
  }

  const wheels: THREE.Mesh[] = [];
  const frontWheels: THREE.Object3D[] = [];
  for (const x of [-1.12, 1.12]) {
    for (const z of [-1.28, 1.28]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.43, z);
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.43, 0.43, 0.34, 8),
        [dark, rim, rim],
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      pivot.add(wheel);
      group.add(pivot);
      wheels.push(wheel);
      if (z > 0) frontWheels.push(pivot);
    }
  }

  const brakeMaterial = new THREE.MeshStandardMaterial({
    color: 0xe22f22,
    emissive: 0xc5150e,
    emissiveIntensity: 1.2,
    roughness: 0.8,
  });
  const brakeLights: THREE.Mesh[] = [];
  for (const x of [-0.7, 0.7]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.08), brakeMaterial.clone());
    light.position.set(x, 0.72, -2.16);
    group.add(light);
    brakeLights.push(light);
  }

  const headlights = new THREE.MeshBasicMaterial({ color: 0xffedaf });
  for (const x of [-0.7, 0.7]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.08), headlights);
    light.position.set(x, 0.72, 2.16);
    group.add(light);
  }

  const rearPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.48, 0.18),
    new THREE.MeshBasicMaterial({ color: 0xe9dfb8 }),
  );
  rearPlate.position.set(0, 0.52, -2.165);
  rearPlate.rotation.y = Math.PI;
  group.add(rearPlate);

  const emergencyLights: THREE.Mesh[] = [];
  if (appearance.police) {
    const panelMaterial = new THREE.MeshStandardMaterial({ color: 0xe8e4d5, roughness: 0.9, flatShading: true });
    for (const x of [-1.096, 1.096]) {
      const doorPanel = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.46), panelMaterial);
      doorPanel.position.set(x, 0.7, -0.12);
      doorPanel.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(doorPanel);
    }

    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.1, 0.24), dark);
    lightBar.position.set(0, 1.82, -0.2);
    group.add(lightBar);
    [
      { x: -0.32, color: 0xe83b2f },
      { x: 0.32, color: 0x3287e8 },
    ].forEach(({ x, color }) => {
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.5,
        roughness: 0.45,
      });
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.3), material);
      light.position.set(x, 1.91, -0.2);
      group.add(light);
      emergencyLights.push(light);
    });
  }

  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  return { group, wheels, frontWheels, brakeLights, emergencyLights };
}

