import * as THREE from "three";
import type { DriftPadDefinition, RampDefinition } from "../maps/types";
import { SpatialGrid } from "./spatial-grid";

/** Fraction of a ramp's length spent rising, then holding the crest, before the drop. */
const RAMP_RISE = 0.48;
const RAMP_CREST = 0.05;
const PAD_TOP = 0.112;

export function addDriftPads(root: THREE.Object3D, pads: readonly DriftPadDefinition[], roadColor: number) {
  if (pads.length === 0) return;
  const paint = new THREE.MeshBasicMaterial({ color: 0xe7dcae });
  const red = new THREE.MeshBasicMaterial({ color: 0xc8553d });
  const coneMaterial = new THREE.MeshStandardMaterial({ color: 0xe0662f, roughness: 0.9, flatShading: true });
  const coneBand = new THREE.MeshBasicMaterial({ color: 0xf4efe0 });
  const cone = new THREE.ConeGeometry(0.28, 0.75, 6);
  const band = new THREE.CylinderGeometry(0.19, 0.22, 0.12, 6);
  for (const pad of pads) {
    const surface = new THREE.Mesh(
      new THREE.CylinderGeometry(pad.radius, pad.radius, 0.06, 64),
      new THREE.MeshStandardMaterial({ color: pad.color ?? roadColor, roughness: 1, flatShading: true }),
    );
    surface.position.set(pad.x, PAD_TOP - 0.03, pad.z);
    surface.receiveShadow = true;
    root.add(surface);
    // Concentric guide rings and a red spin mark give drifts something to orbit.
    for (const [radius, width, material] of [
      [pad.radius - 0.7, 0.32, paint],
      [pad.radius * 0.62, 0.22, paint],
      [pad.radius * 0.26, 0.4, red],
    ] as const) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius - width / 2, radius + width / 2, 64), material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pad.x, PAD_TOP + 0.004, pad.z);
      root.add(ring);
    }
    // Decorative cones just outside the pad edge; they are not obstacles.
    const cones = Math.max(10, Math.round(pad.radius * 0.7));
    for (let index = 0; index < cones; index++) {
      const angle = index / cones * Math.PI * 2;
      const x = pad.x + Math.sin(angle) * (pad.radius + 1.4);
      const z = pad.z + Math.cos(angle) * (pad.radius + 1.4);
      const body = new THREE.Mesh(cone, coneMaterial);
      body.position.set(x, 0.38, z);
      body.castShadow = true;
      const stripe = new THREE.Mesh(band, coneBand);
      stripe.position.set(x, 0.46, z);
      root.add(body, stripe);
    }
  }
}

export function addRamps(root: THREE.Object3D, ramps: readonly RampDefinition[]) {
  if (ramps.length === 0) return;
  // Double-sided so the hand-built wedge never culls away from any approach angle.
  const concrete = new THREE.MeshStandardMaterial({
    color: 0x8e8a7c,
    roughness: 1,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const yellow = new THREE.MeshBasicMaterial({ color: 0xe7c142 });
  const black = new THREE.MeshBasicMaterial({ color: 0x1f211d });
  for (const ramp of ramps) {
    const group = new THREE.Group();
    group.position.set(ramp.x, 0.1, ramp.z);
    group.rotation.y = ramp.rotation ?? 0;
    const body = new THREE.Mesh(createRampGeometry(ramp.width, ramp.length, ramp.height), concrete);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    // Hazard chevrons along the crest edges mark the launch point.
    const crestStart = -ramp.length / 2 + ramp.length * RAMP_RISE;
    const stripes = Math.max(4, Math.round(ramp.width / 0.9));
    for (let stripe = 0; stripe < stripes; stripe++) {
      const tile = new THREE.Mesh(
        new THREE.PlaneGeometry(ramp.width / stripes, 0.5),
        stripe % 2 === 0 ? yellow : black,
      );
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(-ramp.width / 2 + ramp.width / stripes * (stripe + 0.5), ramp.height + 0.012, crestStart + 0.25);
      group.add(tile);
    }
    root.add(group);
  }
}

/** Hump profile: rise, short flat crest, then a steeper drop back to the ground. */
export function rampProfile(localZ: number, length: number, height: number) {
  const t = localZ / length + 0.5;
  if (t <= 0 || t >= 1) return 0;
  if (t < RAMP_RISE) return height * (t / RAMP_RISE);
  if (t < RAMP_RISE + RAMP_CREST) return height;
  return height * (1 - (t - RAMP_RISE - RAMP_CREST) / (1 - RAMP_RISE - RAMP_CREST));
}

function createRampGeometry(width: number, length: number, height: number) {
  const half = width / 2;
  const zs = [-length / 2, -length / 2 + length * RAMP_RISE, -length / 2 + length * (RAMP_RISE + RAMP_CREST), length / 2];
  const ys = [0, height, height, 0];
  const positions: number[] = [];
  const indices: number[] = [];
  // Top surface strips plus side walls; each profile station has left/right top and bottom.
  zs.forEach((z, index) => {
    positions.push(-half, ys[index], z, half, ys[index], z, -half, 0, z, half, 0, z);
  });
  for (let index = 1; index < zs.length; index++) {
    const a = (index - 1) * 4;
    const b = index * 4;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
    indices.push(a + 2, b + 2, a, a, b + 2, b);
    indices.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  geometry.dispose();
  return flat;
}

type RampEntry = RampDefinition & { minX: number; maxX: number; minZ: number; maxZ: number };

/** Presentation-only surface height above the ground plane, from ramps. */
export function createSurfaceQuery(ramps: readonly RampDefinition[]) {
  if (ramps.length === 0) return () => 0;
  const entries: RampEntry[] = ramps.map((ramp) => {
    const rotation = ramp.rotation ?? 0;
    const extentX = Math.abs(Math.cos(rotation)) * ramp.width / 2 + Math.abs(Math.sin(rotation)) * ramp.length / 2;
    const extentZ = Math.abs(Math.sin(rotation)) * ramp.width / 2 + Math.abs(Math.cos(rotation)) * ramp.length / 2;
    return { ...ramp, minX: ramp.x - extentX, maxX: ramp.x + extentX, minZ: ramp.z - extentZ, maxZ: ramp.z + extentZ };
  });
  const grid = new SpatialGrid(entries, 32);
  return (x: number, z: number) => {
    let height = 0;
    for (const ramp of grid.query(x, x, z, z)) {
      const rotation = ramp.rotation ?? 0;
      const dx = x - ramp.x;
      const dz = z - ramp.z;
      const localX = Math.cos(rotation) * dx - Math.sin(rotation) * dz;
      const localZ = Math.sin(rotation) * dx + Math.cos(rotation) * dz;
      if (Math.abs(localX) > ramp.width / 2) continue;
      height = Math.max(height, rampProfile(localZ, ramp.length, ramp.height));
    }
    return height;
  };
}
