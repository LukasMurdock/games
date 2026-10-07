import * as THREE from "three";
import type { BuildingDefinition } from "../maps/types";
import type { Obstacle } from "./types";

const UP = new THREE.Vector3(0, 1, 0);
const FLOOR_HEIGHT = 3.05;
const PLINTH = 0.16;
/** First upper-floor window row; clears the storefront glazing, awning, and sign fascia. */
const UPPER_WINDOW_START = PLINTH + 4.85;
const ACCENTS = [0xd65a3b, 0x2f7f86, 0xe0b04a, 0x5b6fa8, 0x8a4f7d, 0x3f8a55];
const GLASS = [0x22343a, 0x26383f, 0x1f2f33, 0x2b3a3c];
const ROOFS = [0x4a4943, 0x55534b, 0x3f4442, 0x4d4a42];

/**
 * Which local side of a building faces the street: 0 = +z, 1 = +x, 2 = -z, 3 = -x.
 * Storefronts, entrances, and street furniture are placed on that side.
 */
export type BuildingFrontSide = 0 | 1 | 2 | 3;

type Kit = ReturnType<typeof createKit>;

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
  frontSide: BuildingFrontSide = 0,
) {
  const group = new THREE.Group();
  // Facades are authored facing +z; turning the detail group lets any side face the street
  // while the footprint, collision box, and foundation keep the map's orientation.
  const detail = new THREE.Group();
  detail.rotation.y = frontSide * Math.PI / 2;
  const swapped = frontSide % 2 === 1;
  const localWidth = swapped ? depth : width;
  const localDepth = swapped ? width : depth;
  const kit = createKit(detail, seedFor(x, z));

  kit.box(width + 1.7, PLINTH, depth + 1.7, 0, PLINTH / 2, 0, 0xaaa58a, { cast: false, receive: true }, group);

  if (style === "hangar") addHangar(kit, localWidth, localDepth, height, color);
  else if (style === "tower") addControlTower(kit, localWidth, localDepth, height, color);
  else if (style === "freight") addFreight(kit, localWidth, localDepth, height, color);
  else addStandard(kit, localWidth, localDepth, height, color);

  group.add(detail);
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
}

/** Low shops, mid-rise blocks, and stepped towers share one facade vocabulary. */
function addStandard(kit: Kit, width: number, depth: number, height: number, color: number) {
  const { random } = kit;
  const archetype = height >= 16 ? "tower" : height <= 9 ? "shop" : "midrise";
  const trim = shade(color, 0.68);
  const roofColor = pick(random, ROOFS);
  const glass = pick(random, GLASS);
  const accent = pick(random, ACCENTS);

  // Pitched roofs only on small, low shops so they read as a distinct, older building type.
  const pitched = archetype === "shop" && height <= 7.5 && random() < 0.45;
  let roofTop = height + PLINTH;

  if (archetype === "tower") {
    const podiumHeight = Math.min(7.4, Math.max(5.8, height * 0.28));
    const inset = Math.min(1.4, Math.min(width, depth) * 0.12);
    kit.box(width, podiumHeight, depth, 0, PLINTH + podiumHeight / 2, 0, color);
    kit.box(width + 0.3, 0.4, depth + 0.3, 0, PLINTH + podiumHeight, 0, trim);
    const upperWidth = width - inset * 2;
    const upperDepth = depth - inset * 2;
    const upperHeight = height - podiumHeight;
    kit.box(upperWidth, upperHeight, upperDepth, 0, PLINTH + podiumHeight + upperHeight / 2, 0, color);
    addWindowGrid(kit, upperWidth, upperDepth, PLINTH + podiumHeight + 0.9, roofTop - 0.9, glass, {
      windowWidth: 0.9 + random() * 0.35,
      windowHeight: 2.1,
      spacing: 1.9,
    });
    addWindowGrid(kit, width, depth, UPPER_WINDOW_START, PLINTH + podiumHeight - 0.6, glass, {
      windowWidth: 1.6,
      windowHeight: 1.5,
      spacing: 2.8,
    });
    // Crown band, parapet, and mechanical penthouse with a mast.
    kit.box(upperWidth + 0.24, 0.55, upperDepth + 0.24, 0, roofTop - 0.28, 0, trim);
    addParapetRoof(kit, upperWidth, upperDepth, roofTop, trim, roofColor);
    const penthouseWidth = upperWidth * 0.42;
    const penthouseDepth = upperDepth * 0.38;
    kit.box(penthouseWidth, 2.3, penthouseDepth, upperWidth * 0.12, roofTop + 1.15, -upperDepth * 0.1, trim);
    kit.cylinder(0.07, 0.1, 4.2, upperWidth * 0.12, roofTop + 2.3 + 2.1, -upperDepth * 0.1, 0x3a3c38);
    addRoofClutter(kit, upperWidth, upperDepth, roofTop, 2);
  } else {
    kit.box(width, height, depth, 0, PLINTH + height / 2, 0, color);
    if (archetype === "midrise") {
      // Corner pilasters and floor ledges give the slab a readable structure from a distance.
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        kit.box(0.55, height, 0.55, sx * (width / 2 - 0.17), PLINTH + height / 2, sz * (depth / 2 - 0.17), trim);
      }
      // Ledges sit between window rows, starting above the storefront and its awning.
      for (let y = UPPER_WINDOW_START + FLOOR_HEIGHT / 2 + 0.2; y < roofTop - 1.5; y += FLOOR_HEIGHT) {
        kit.box(width + 0.16, 0.14, depth + 0.16, 0, y, 0, trim);
      }
    }
    addWindowGrid(kit, width, depth, UPPER_WINDOW_START, roofTop - 0.8, glass, {
      windowWidth: 1.1 + random() * 0.6,
      windowHeight: 1.25 + random() * 0.35,
      spacing: 2.7 + random() * 0.6,
    });
    if (pitched) {
      const roofMaterial = random() < 0.5 ? 0x8a4f3c : 0x4d5357;
      const ridgeAlongZ = depth > width;
      const rise = Math.min(2.6, Math.min(width, depth) * 0.28);
      const roof = new THREE.Mesh(
        createGableRoofGeometry(
          (ridgeAlongZ ? width : depth) + 0.9,
          (ridgeAlongZ ? depth : width) + 0.9,
          rise,
        ),
        kit.standard(roofMaterial),
      );
      roof.position.y = roofTop;
      if (!ridgeAlongZ) roof.rotation.y = Math.PI / 2;
      roof.castShadow = true;
      roof.receiveShadow = true;
      kit.root.add(roof);
      kit.box(1, 1.6, 1, width * 0.22, roofTop + rise * 0.55, depth * 0.1, shade(color, 0.55));
    } else {
      addParapetRoof(kit, width, depth, roofTop, trim, roofColor);
      addRoofClutter(kit, width, depth, roofTop, archetype === "midrise" ? 1 : 0);
      if (archetype === "midrise" && random() < 0.4) addWaterTank(kit, -width * 0.22, roofTop, depth * 0.18);
    }
  }

  kit.box(width + 0.06, 0.48, depth + 0.06, 0, 0.4, 0, 0x655f50, { cast: true, receive: false });
  addStorefront(kit, width, depth, archetype, glass, accent, trim);
  addEntranceFurniture(kit, width, depth);
}

function addStorefront(
  kit: Kit,
  width: number,
  depth: number,
  archetype: "shop" | "midrise" | "tower",
  glass: number,
  accent: number,
  trim: number,
) {
  const { random } = kit;
  const front = depth / 2;
  const glazingWidth = Math.min(width - 1.6, archetype === "tower" ? width * 0.7 : width * 0.82);
  const glazingHeight = 2.35;
  const glazingY = PLINTH + 0.55 + glazingHeight / 2;
  kit.plane(glazingWidth, glazingHeight, 0, glazingY, front + 0.012, 0, glass);
  // Mullions and a transom read as a shopfront rather than a dark rectangle.
  const mullions = Math.max(2, Math.round(glazingWidth / 1.7));
  for (let index = 0; index <= mullions; index++) {
    const x = -glazingWidth / 2 + (glazingWidth / mullions) * index;
    kit.box(0.09, glazingHeight, 0.06, x, glazingY, front + 0.03, trim, { cast: false, receive: false });
  }
  kit.box(glazingWidth, 0.09, 0.06, 0, PLINTH + 0.55 + glazingHeight * 0.78, front + 0.03, trim, { cast: false, receive: false });
  kit.plane(1.5, 2.2, 0, PLINTH + 1.1, front + 0.02, 0, shade(glass, 0.7));

  const awningY = PLINTH + 0.55 + glazingHeight + 0.18;
  if (archetype !== "tower" && random() < 0.75) {
    const awningDepth = 1.1;
    if (random() < 0.5) {
      // Striped canvas awning.
      const stripes = Math.max(4, Math.round(glazingWidth / 0.75));
      const stripeWidth = glazingWidth / stripes;
      for (let stripe = 0; stripe < stripes; stripe++) {
        const mesh = kit.box(
          stripeWidth,
          0.1,
          awningDepth,
          -glazingWidth / 2 + stripeWidth * (stripe + 0.5),
          awningY,
          front + awningDepth / 2 - 0.05,
          stripe % 2 === 0 ? 0xf3e7bd : accent,
          { cast: true, receive: false, basic: true },
        );
        mesh.rotation.x = -0.22;
      }
    } else {
      // Flat steel canopy.
      kit.box(glazingWidth + 0.4, 0.18, awningDepth, 0, awningY, front + awningDepth / 2, shade(accent, 0.8));
    }
  }
  // Sign fascia with block "lettering"; mid-rises get it on the first band only.
  if (archetype !== "tower" || random() < 0.5) {
    const signWidth = Math.min(glazingWidth * 0.7, 6.5);
    const signY = awningY + 0.62;
    kit.box(signWidth, 0.72, 0.14, 0, signY, front + 0.08, accent, { cast: false, receive: false, basic: true });
    const letters = Math.max(3, Math.floor(signWidth / 0.62));
    const letterSpan = signWidth * 0.78;
    for (let letter = 0; letter < letters; letter++) {
      if (random() < 0.18) continue;
      kit.plane(
        letterSpan / letters * 0.62,
        0.34,
        -letterSpan / 2 + letterSpan / letters * (letter + 0.5),
        signY,
        front + 0.156,
        0,
        0xf6efd8,
      );
    }
  }
}

function addEntranceFurniture(kit: Kit, width: number, depth: number) {
  const { random } = kit;
  const front = depth / 2 + 0.5;
  const planterX = Math.min(width / 2 - 0.6, 1.6);
  for (const side of [-1, 1]) {
    kit.box(0.62, 0.48, 0.62, side * planterX, PLINTH + 0.24, front, 0x8f8b7d);
    kit.box(0.5, 0.36, 0.5, side * planterX, PLINTH + 0.6, front, 0x4a6a2a);
  }
  if (width > 9 && random() < 0.6) {
    const benchX = -width / 2 + 1.6;
    kit.box(1.5, 0.1, 0.46, benchX, PLINTH + 0.46, front, 0x8a6a46);
    kit.box(1.5, 0.42, 0.08, benchX, PLINTH + 0.72, front - 0.22, 0x8a6a46);
    for (const side of [-1, 1]) kit.box(0.08, 0.46, 0.4, benchX + side * 0.62, PLINTH + 0.23, front, 0x33352f);
  }
  if (random() < 0.7) kit.cylinder(0.24, 0.22, 0.85, width / 2 - 0.7, PLINTH + 0.43, front, 0x3c4a3a);
}

function addParapetRoof(kit: Kit, width: number, depth: number, top: number, trim: number, roofColor: number) {
  kit.box(width - 0.3, 0.12, depth - 0.3, 0, top + 0.06, 0, roofColor, { cast: false, receive: true });
  const parapetHeight = 0.62;
  const thickness = 0.3;
  const y = top + parapetHeight / 2;
  kit.box(width + 0.1, parapetHeight, thickness, 0, y, depth / 2 - thickness / 2 + 0.05, trim);
  kit.box(width + 0.1, parapetHeight, thickness, 0, y, -depth / 2 + thickness / 2 - 0.05, trim);
  kit.box(thickness, parapetHeight, depth - 0.5, width / 2 - thickness / 2 + 0.05, y, 0, trim);
  kit.box(thickness, parapetHeight, depth - 0.5, -width / 2 + thickness / 2 - 0.05, y, 0, trim);
}

/** Rooftop units, vents, and a stair bulkhead: the detail an isometric camera mostly sees. */
function addRoofClutter(kit: Kit, width: number, depth: number, top: number, bulkheads: number) {
  const { random } = kit;
  const usableWidth = width - 2.4;
  const usableDepth = depth - 2.4;
  if (usableWidth <= 1 || usableDepth <= 1) return;
  const units = 1 + Math.floor((width * depth) / 110);
  for (let unit = 0; unit < units; unit++) {
    const x = (random() - 0.5) * usableWidth;
    const z = (random() - 0.5) * usableDepth;
    const rotate = random() < 0.5;
    const unitWidth = rotate ? 1.1 : 1.7;
    const unitDepth = rotate ? 1.7 : 1.1;
    kit.box(unitWidth, 0.85, unitDepth, x, top + 0.55, z, 0x8f8c82);
    kit.box(unitWidth * 0.7, 0.04, unitDepth * 0.7, x, top + 1.0, z, 0x3b3d39, { cast: false, receive: false, basic: true });
  }
  const vents = 1 + Math.floor(random() * 3);
  for (let vent = 0; vent < vents; vent++) {
    kit.cylinder(0.16, 0.16, 0.7, (random() - 0.5) * usableWidth, top + 0.45, (random() - 0.5) * usableDepth, 0x9a978d);
  }
  for (let index = 0; index < bulkheads; index++) {
    const x = (random() < 0.5 ? -1 : 1) * usableWidth * 0.3;
    const z = (random() < 0.5 ? -1 : 1) * usableDepth * 0.3;
    kit.box(2.4, 2.1, 2.2, x, top + 1.05, z, 0x7a776d);
    kit.box(2.6, 0.16, 2.4, x, top + 2.18, z, 0x4a4943);
  }
}

function addWaterTank(kit: Kit, x: number, top: number, z: number) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    kit.box(0.12, 1.6, 0.12, x + sx * 0.75, top + 0.8, z + sz * 0.75, 0x3d3a34);
  }
  kit.cylinder(1.15, 1.15, 2, x, top + 2.6, z, 0x7b5a3e, 8);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.8, 8), kit.standard(0x4b3a2c));
  cap.position.set(x, top + 4, z);
  cap.castShadow = true;
  kit.root.add(cap);
}

function addWindowGrid(
  kit: Kit,
  width: number,
  depth: number,
  bottom: number,
  top: number,
  glass: number,
  options: { windowWidth: number; windowHeight: number; spacing: number },
) {
  const { random } = kit;
  const reflection = shade(glass, 1.9);
  const windows: Array<[number, number, number, number]> = [];
  for (let y = bottom; y < top; y += FLOOR_HEIGHT) {
    const facades: Array<[number, number, number]> = [
      [width, depth / 2 + 0.011, 0],
      [width, depth / 2 + 0.011, Math.PI],
      [depth, width / 2 + 0.011, Math.PI / 2],
      [depth, width / 2 + 0.011, -Math.PI / 2],
    ];
    for (const [span, offset, rotation] of facades) {
      const count = Math.floor((span - 1.2) / options.spacing);
      if (count <= 0) continue;
      const used = (count - 1) * options.spacing;
      for (let index = 0; index < count; index++) {
        const along = -used / 2 + index * options.spacing;
        const sin = Math.sin(rotation);
        const cos = Math.cos(rotation);
        windows.push([along * cos + offset * sin, y, -along * sin + offset * cos, rotation]);
      }
    }
  }
  if (windows.length === 0) return;
  const instances = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(options.windowWidth, options.windowHeight),
    kit.basic(0xffffff),
    windows.length,
  );
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  const tint = new THREE.Color();
  windows.forEach(([px, py, pz, rotation], index) => {
    quaternion.setFromAxisAngle(UP, rotation);
    matrix.compose(position.set(px, py, pz), quaternion, scale);
    instances.setMatrixAt(index, matrix);
    // A few panes catch the sky so facades are not a uniform dark grid.
    instances.setColorAt(index, tint.setHex(random() < 0.14 ? reflection : glass));
  });
  kit.root.add(instances);
}

function addHangar(kit: Kit, width: number, depth: number, height: number, color: number) {
  const roofRise = Math.min(2.35, height * 0.3);
  const wallHeight = height - roofRise;
  kit.box(width, wallHeight, depth, 0, wallHeight / 2 + PLINTH, 0, color);

  const ridgeRunsAlongZ = depth >= width;
  const span = ridgeRunsAlongZ ? width : depth;
  const length = ridgeRunsAlongZ ? depth : width;
  const roof = new THREE.Mesh(createGableRoofGeometry(span + 0.5, length + 0.5, roofRise), kit.standard(0x454942));
  roof.position.y = wallHeight + PLINTH;
  if (!ridgeRunsAlongZ) roof.rotation.y = Math.PI / 2;
  roof.castShadow = true;
  roof.receiveShadow = true;
  kit.root.add(roof);
  // Standing-seam ribs down both roof slopes.
  const slope = Math.atan2(roofRise, span / 2);
  const slopeLength = Math.hypot(roofRise, span / 2);
  const ribs = Math.max(3, Math.floor(length / 2.2));
  for (let rib = 0; rib < ribs; rib++) {
    const along = -length / 2 + (length / (ribs - 1)) * rib;
    for (const side of [-1, 1]) {
      const mesh = kit.box(slopeLength, 0.08, 0.12, 0, 0, 0, 0x5a5f56, { cast: false, receive: false });
      const across = side * span / 4;
      const y = wallHeight + PLINTH + roofRise / 2 + 0.06;
      if (ridgeRunsAlongZ) {
        mesh.position.set(across, y, along);
        mesh.rotation.z = side * -slope;
      } else {
        mesh.position.set(along, y, across);
        mesh.rotation.set(0, Math.PI / 2, side * -slope);
      }
    }
  }

  // Large door on the front gable, a clerestory band, and a small office annex.
  const doorWidth = Math.min(width * 0.72, (ridgeRunsAlongZ ? width : depth) * 0.72);
  const doorHeight = wallHeight * 0.72;
  kit.plane(doorWidth, doorHeight, 0, doorHeight / 2 + 0.17, depth / 2 + 0.012, 0, 0x263537);
  for (let panel = 1; panel < 4; panel++) {
    kit.plane(0.1, doorHeight, -doorWidth / 2 + doorWidth * panel / 4, doorHeight / 2 + 0.17, depth / 2 + 0.016, 0, 0xc6b987);
  }
  kit.box(doorWidth + 0.5, 0.3, 0.3, 0, doorHeight + 0.32, depth / 2 + 0.12, 0xc6b987);
  for (const side of [-1, 1]) {
    kit.plane(depth * 0.8, 0.7, side * (width / 2 + 0.012), wallHeight - 0.7, 0, side * Math.PI / 2, 0x30454a);
  }
  const annexWidth = Math.min(6, width * 0.3);
  kit.box(annexWidth, 3.1, 3.4, width / 2 - annexWidth / 2 - 0.4, PLINTH + 1.55, depth / 2 + 1.7, shade(color, 0.9));
  kit.box(annexWidth + 0.3, 0.25, 3.7, width / 2 - annexWidth / 2 - 0.4, PLINTH + 3.2, depth / 2 + 1.7, 0x454942);
  kit.plane(annexWidth * 0.6, 1, width / 2 - annexWidth / 2 - 0.4, PLINTH + 1.9, depth / 2 + 3.412, 0, 0x26383a);
}

function addFreight(kit: Kit, width: number, depth: number, height: number, color: number) {
  const { random } = kit;
  kit.box(width, height, depth, 0, height / 2 + PLINTH, 0, color);
  kit.box(width + 0.65, 0.34, depth + 0.65, 0, height + 0.33, 0, 0x3f4540);
  // Skylight strips and roof fans.
  const longAlongZ = depth >= width;
  const strips = Math.max(2, Math.floor((longAlongZ ? width : depth) / 6));
  for (let strip = 0; strip < strips; strip++) {
    const offset = -((longAlongZ ? width : depth) / 2) + ((longAlongZ ? width : depth) / strips) * (strip + 0.5);
    if (longAlongZ) kit.box(0.8, 0.18, depth * 0.72, offset, height + 0.58, 0, 0x7f908c);
    else kit.box(width * 0.72, 0.18, 0.8, 0, height + 0.58, offset, 0x7f908c);
  }
  for (let fan = 0; fan < 2; fan++) {
    kit.cylinder(0.5, 0.6, 0.6, (random() - 0.5) * width * 0.6, height + 0.8, (random() - 0.5) * depth * 0.6, 0x7c7a72, 8);
  }

  // Corrugation lines and loading bays with dock bumpers on both long sides.
  const corrugation = shade(color, 0.82);
  const loadingSideRunsAlongZ = depth >= width;
  const sideLength = loadingSideRunsAlongZ ? depth : width;
  const bayCount = Math.max(2, Math.floor(sideLength / 7));
  const baySpacing = sideLength / bayCount;
  const doorWidth = Math.min(3.4, baySpacing * 0.62);
  const doorHeight = Math.min(3, height * 0.58);
  for (let bay = 0; bay < bayCount; bay++) {
    const along = -sideLength / 2 + baySpacing * (bay + 0.5);
    for (const side of [-1, 1]) {
      const rotation = loadingSideRunsAlongZ ? side * Math.PI / 2 : side < 0 ? Math.PI : 0;
      const normal = loadingSideRunsAlongZ ? width / 2 : depth / 2;
      const place = (outward: number, lateral: number): [number, number] => loadingSideRunsAlongZ
        ? [side * (normal + outward), along + lateral]
        : [along + lateral, side * (normal + outward)];
      const [doorX, doorZ] = place(0.012, 0);
      kit.plane(doorWidth, doorHeight, doorX, doorHeight / 2 + 0.17, doorZ, rotation, 0x293938);
      const [headerX, headerZ] = place(0.016, 0);
      kit.plane(doorWidth + 0.35, 0.16, headerX, doorHeight + 0.32, headerZ, rotation, 0xd2c497);
      for (const lateral of [-1, 1]) {
        const [bumperX, bumperZ] = place(0.12, lateral * (doorWidth / 2 + 0.22));
        kit.box(0.26, 0.5, 0.26, bumperX, PLINTH + 0.6, bumperZ, 0x1f201d, { cast: false, receive: false });
      }
    }
  }
  for (let line = 1; line < Math.floor(sideLength / 1.4); line++) {
    const along = -sideLength / 2 + line * 1.4;
    for (const side of [-1, 1]) {
      const rotation = loadingSideRunsAlongZ ? side * Math.PI / 2 : side < 0 ? Math.PI : 0;
      const normal = (loadingSideRunsAlongZ ? width : depth) / 2 + 0.008;
      const lineX = loadingSideRunsAlongZ ? side * normal : along;
      const lineZ = loadingSideRunsAlongZ ? along : side * normal;
      kit.plane(0.06, height - doorHeight - 0.6, lineX, doorHeight + 0.5 + (height - doorHeight - 0.6) / 2, lineZ, rotation, corrugation);
    }
  }
}

function addControlTower(kit: Kit, width: number, depth: number, height: number, color: number) {
  const baseHeight = 3.1;
  const cabHeight = 3.2;
  const shaftTop = height - cabHeight;
  kit.box(width, baseHeight, depth, 0, baseHeight / 2 + PLINTH, 0, color);
  kit.box(width * 0.48, shaftTop - baseHeight, depth * 0.48, 0, baseHeight + (shaftTop - baseHeight) / 2 + PLINTH, 0, color);
  kit.box(width * 0.62, 0.3, depth * 0.62, 0, shaftTop - 0.05, 0, shade(color, 0.7));
  const cab = kit.box(width * 0.88, cabHeight, depth * 0.88, 0, shaftTop + cabHeight / 2 + PLINTH, 0, 0x26383a);
  (cab.material as THREE.MeshStandardMaterial).roughness = 0.8;
  // Catwalk and railing around the cab, then roof and antenna.
  kit.box(width * 1.08, 0.14, depth * 1.08, 0, shaftTop + PLINTH + 0.05, 0, 0x5a5d57);
  kit.box(width * 1.08, 0.55, 0.06, 0, shaftTop + PLINTH + 0.4, depth * 0.54, 0x5a5d57, { cast: false, receive: false });
  kit.box(width * 1.08, 0.55, 0.06, 0, shaftTop + PLINTH + 0.4, -depth * 0.54, 0x5a5d57, { cast: false, receive: false });
  kit.box(0.06, 0.55, depth * 1.08, width * 0.54, shaftTop + PLINTH + 0.4, 0, 0x5a5d57, { cast: false, receive: false });
  kit.box(0.06, 0.55, depth * 1.08, -width * 0.54, shaftTop + PLINTH + 0.4, 0, 0x5a5d57, { cast: false, receive: false });
  kit.box(width, 0.48, depth, 0, height + 0.4, 0, 0x48463d);
  kit.cylinder(0.06, 0.09, 3.2, width * 0.25, height + 2.2, 0, 0x3a3c38);
  kit.box(0.5, 0.18, 0.18, width * 0.25, height + 3.7, 0, 0xd85739, { cast: false, receive: false, basic: true });
}

function createKit(root: THREE.Object3D, seed: number) {
  const random = mulberry32(seed);
  const standardMaterials = new Map<number, THREE.MeshStandardMaterial>();
  const basicMaterials = new Map<number, THREE.MeshBasicMaterial>();
  const standard = (color: number) => {
    let material = standardMaterials.get(color);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
      standardMaterials.set(color, material);
    }
    return material;
  };
  const basic = (color: number) => {
    let material = basicMaterials.get(color);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color });
      basicMaterials.set(color, material);
    }
    return material;
  };
  return {
    root,
    random,
    standard,
    basic,
    box(
      width: number,
      height: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      color: number,
      options: { cast?: boolean; receive?: boolean; basic?: boolean } = {},
      parent: THREE.Object3D = root,
    ) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        options.basic ? basic(color) : standard(color),
      );
      mesh.position.set(x, y, z);
      mesh.castShadow = options.cast ?? true;
      mesh.receiveShadow = options.receive ?? true;
      parent.add(mesh);
      return mesh;
    },
    cylinder(top: number, bottom: number, height: number, x: number, y: number, z: number, color: number, segments = 6) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, segments), standard(color));
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      return mesh;
    },
    /** Unlit facade decal (glass, doors, lettering) facing along the given yaw. */
    plane(width: number, height: number, x: number, y: number, z: number, yaw: number, color: number) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), basic(color));
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      root.add(mesh);
      return mesh;
    },
  };
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

function shade(color: number, factor: number) {
  return new THREE.Color(color).multiplyScalar(factor).getHex();
}

function pick<T>(random: () => number, values: readonly T[]) {
  return values[Math.floor(random() * values.length) % values.length];
}

function seedFor(x: number, z: number) {
  return (Math.imul(Math.round(x * 10) | 0, 0x45d9f3b) ^ Math.imul(Math.round(z * 10) | 0, 0x27d4eb2d)) >>> 0;
}

function mulberry32(seed: number) {
  let state = seed || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
