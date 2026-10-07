import * as THREE from "three";
import type { GameMapDefinition } from "../maps";
import type { WorldRuntime } from "../world/types";

type Point = { x: number; z: number };

/** Linear-space line colors; values above 1 feed the bloom pass. */
const ROAD_COLOR = new THREE.Color(0.22, 1.9, 2.2);
const CIRCUIT_COLOR = new THREE.Color(1.35, 1.05, 0.85);
const LOT_COLOR = new THREE.Color(0.35, 0.9, 1.6);
const BUILDING_COLOR = new THREE.Color(1.8, 0.22, 0.95);
const FENCE_COLOR = new THREE.Color(0.25, 0.4, 1.1);
const SEGMENT_LENGTH = 6;
const LINE_HEIGHT = 0.18;
/** Only the neighborhood around the spawn is drawn; distant lines would pile up at the horizon. */
const MAXIMUM_DRAW_DISTANCE = 260;

export type LightDrawing = {
  object: THREE.LineSegments;
  /** Distance from spawn of the farthest drawn vertex. */
  extent: number;
  /** Distance from spawn reached by the light front. */
  setProgress(distance: number): void;
  setOpacity(opacity: number): void;
  setTime(seconds: number): void;
  dispose(): void;
};

/**
 * The selected map rendered as luminous contours: road edges, the circuit, lots, the
 * perimeter, and building outlines. Everything is revealed by a white-hot front that
 * travels outward from the spawn point; building contours rise as the front passes.
 */
export function createLightDrawing(map: GameMapDefinition, world: WorldRuntime): LightDrawing {
  const origin = { x: world.spawnPosition.x, z: world.spawnPosition.z };
  const positions: number[] = [];
  const colors: number[] = [];
  const reveals: number[] = [];
  const rises: number[] = [];
  let extent = 0;

  const distanceTo = (x: number, z: number) => Math.hypot(x - origin.x, z - origin.z);
  function pushVertex(x: number, y: number, z: number, color: THREE.Color, reveal: number, rise: number) {
    positions.push(x, y, z);
    colors.push(color.r, color.g, color.b);
    reveals.push(reveal);
    rises.push(rise);
    extent = Math.max(extent, reveal);
  }
  /** Ground line, subdivided so the reveal front can travel along long straights. */
  function groundLine(start: Point, end: Point, color: THREE.Color) {
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    const pieces = Math.max(1, Math.ceil(length / SEGMENT_LENGTH));
    for (let piece = 0; piece < pieces; piece++) {
      const from = piece / pieces;
      const to = (piece + 1) / pieces;
      const ax = start.x + (end.x - start.x) * from;
      const az = start.z + (end.z - start.z) * from;
      const bx = start.x + (end.x - start.x) * to;
      const bz = start.z + (end.z - start.z) * to;
      const revealA = distanceTo(ax, az);
      const revealB = distanceTo(bx, bz);
      if (Math.min(revealA, revealB) > MAXIMUM_DRAW_DISTANCE) continue;
      pushVertex(ax, LINE_HEIGHT, az, color, revealA, 0);
      pushVertex(bx, LINE_HEIGHT, bz, color, revealB, 0);
    }
  }
  function polyline(points: readonly Point[], color: THREE.Color, closed = false) {
    for (let index = 1; index < points.length; index++) groundLine(points[index - 1], points[index], color);
    if (closed && points.length > 2) groundLine(points[points.length - 1], points[0], color);
  }
  function offsetPolyline(points: readonly Point[], offsets: (index: number) => number, closed = false) {
    return points.map((point, index) => {
      const previous = points[index === 0 ? (closed ? points.length - 1 : 0) : index - 1];
      const next = points[index === points.length - 1 ? (closed ? 0 : index) : index + 1];
      const dx = next.x - previous.x;
      const dz = next.z - previous.z;
      const length = Math.hypot(dx, dz) || 1;
      const offset = offsets(index);
      return { x: point.x + (dz / length) * offset, z: point.z - (dx / length) * offset };
    });
  }
  function rectangle(x: number, z: number, width: number, depth: number, rotation: number) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
      const localX = sx * width / 2;
      const localZ = sz * depth / 2;
      return { x: x + cos * localX + sin * localZ, z: z - sin * localX + cos * localZ };
    });
  }

  for (const corridor of map.corridors ?? []) {
    const half = corridor.width / 2;
    polyline(offsetPolyline(corridor.points, () => half), ROAD_COLOR);
    polyline(offsetPolyline(corridor.points, () => -half), ROAD_COLOR);
  }
  for (const road of map.roads) {
    polyline(rectangle(road.x, road.z, road.width, road.depth, road.rotation ?? 0), ROAD_COLOR, true);
  }
  for (const lot of map.parkingLots) {
    polyline(rectangle(lot.x, lot.z, lot.width, lot.depth, lot.rotation ?? 0), LOT_COLOR, true);
  }
  if (world.circuitPath) {
    const { points, widths } = world.circuitPath;
    polyline(offsetPolyline(points, (index) => widths[index] / 2, true), CIRCUIT_COLOR, true);
    polyline(offsetPolyline(points, (index) => -widths[index] / 2, true), CIRCUIT_COLOR, true);
  }
  const limit = map.worldLimit;
  polyline([
    { x: -limit, z: -limit },
    { x: limit, z: -limit },
    { x: limit, z: limit },
    { x: -limit, z: limit },
  ], FENCE_COLOR, true);

  for (const building of map.buildings) {
    const corners = rectangle(building.x, building.z, building.width, building.depth, building.rotation ?? 0);
    const reveal = distanceTo(building.x, building.z);
    if (reveal > MAXIMUM_DRAW_DISTANCE) continue;
    for (let index = 0; index < 4; index++) {
      const a = corners[index];
      const b = corners[(index + 1) % 4];
      // Footprint, roof outline, and one vertical edge per corner. Roof vertices carry
      // `rise`, so contours grow upward after the front reaches the building.
      pushVertex(a.x, LINE_HEIGHT, a.z, BUILDING_COLOR, reveal, 0);
      pushVertex(b.x, LINE_HEIGHT, b.z, BUILDING_COLOR, reveal, 0);
      pushVertex(a.x, building.height, a.z, BUILDING_COLOR, reveal, 1);
      pushVertex(b.x, building.height, b.z, BUILDING_COLOR, reveal, 1);
      pushVertex(a.x, LINE_HEIGHT, a.z, BUILDING_COLOR, reveal, 0);
      pushVertex(a.x, building.height, a.z, BUILDING_COLOR, reveal, 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("lineColor", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("reveal", new THREE.Float32BufferAttribute(reveals, 1));
  geometry.setAttribute("rise", new THREE.Float32BufferAttribute(rises, 1));

  const uniforms = {
    uProgress: { value: 0 },
    uOpacity: { value: 1 },
    uTime: { value: 0 },
    uHeadWidth: { value: Math.max(10, extent * 0.06) },
    uRiseDistance: { value: Math.max(18, extent * 0.12) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 lineColor;
      attribute float reveal;
      attribute float rise;
      uniform float uProgress;
      uniform float uRiseDistance;
      varying vec3 vColor;
      varying float vReveal;
      void main() {
        vColor = lineColor;
        vReveal = reveal;
        vec3 transformed = position;
        float grown = smoothstep(0.0, uRiseDistance, uProgress - reveal);
        transformed.y = mix(transformed.y, ${LINE_HEIGHT.toFixed(2)}, rise * (1.0 - grown));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uProgress;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uHeadWidth;
      varying vec3 vColor;
      varying float vReveal;
      void main() {
        float behind = uProgress - vReveal;
        if (behind < 0.0) discard;
        // White-hot core at the front, settling into the saturated line color behind it.
        float head = 1.0 - smoothstep(0.0, uHeadWidth, behind);
        vec3 color = mix(vColor, vec3(6.0, 5.6, 5.2), head * head);
        gl_FragColor = vec4(color * uOpacity, 1.0);
      }
    `,
    // Max blending: shared segment endpoints and crossings would otherwise double up
    // under additive blending and bloom into bright beads along every line.
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const object = new THREE.LineSegments(geometry, material);
  object.name = "intro-light-drawing";
  object.frustumCulled = false;
  object.renderOrder = 1001;

  return {
    object,
    extent,
    setProgress(distance) { uniforms.uProgress.value = distance; },
    setOpacity(opacity) { uniforms.uOpacity.value = opacity; },
    setTime(seconds) { uniforms.uTime.value = seconds; },
    dispose() {
      object.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
