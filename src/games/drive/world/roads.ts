import * as THREE from "three";
import type { RoadCorridorDefinition } from "../maps/types";

export type CorridorJunction = {
  x: number;
  z: number;
  radius: number;
};

export type RoadMarkDefinition = {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation?: number;
};

export function createCorridorMesh(
  corridor: RoadCorridorDefinition,
  material: THREE.Material,
  elevation = 0.105,
  junctions: readonly CorridorJunction[] = [],
) {
  const positions: number[] = [];
  const indices: number[] = [];
  const halfWidth = corridor.width / 2;
  const sections = splitCorridorAtJunctions(corridor, junctions);

  for (const section of sections) {
    const basePair = positions.length / 3 / 2;
    for (let index = 0; index < section.points.length; index++) {
      const current = section.points[index];
      const previous = section.points[Math.max(0, index - 1)];
      const next = section.points[Math.min(section.points.length - 1, index + 1)];
      const incoming = normalize(current.x - previous.x, current.z - previous.z);
      const outgoing = normalize(next.x - current.x, next.z - current.z);
      if (index === 0) incoming.set(outgoing.x, outgoing.z);
      if (index === section.points.length - 1) outgoing.set(incoming.x, incoming.z);
      const rightIncoming = { x: incoming.z, z: -incoming.x };
      const rightOutgoing = { x: outgoing.z, z: -outgoing.x };
      const miter = normalize(rightIncoming.x + rightOutgoing.x, rightIncoming.z + rightOutgoing.z);
      const denominator = miter.x * rightOutgoing.x + miter.z * rightOutgoing.z;
      const safeDenominator = Math.abs(denominator) < 0.25
        ? Math.sign(denominator || 1) * 0.25
        : denominator;
      const miterLength = THREE.MathUtils.clamp(halfWidth / safeDenominator, -halfWidth * 2, halfWidth * 2);
      let centerX = current.x;
      let centerZ = current.z;
      if (index === 0 && section.extendStart) {
        centerX -= outgoing.x * halfWidth;
        centerZ -= outgoing.z * halfWidth;
      } else if (index === section.points.length - 1 && section.extendEnd) {
        centerX += incoming.x * halfWidth;
        centerZ += incoming.z * halfWidth;
      }
      positions.push(
        centerX + miter.x * miterLength, elevation, centerZ + miter.z * miterLength,
        centerX - miter.x * miterLength, elevation, centerZ - miter.z * miterLength,
      );
      if (index === 0) continue;
      const previousPair = (basePair + index - 1) * 2;
      const pair = (basePair + index) * 2;
      indices.push(previousPair, previousPair + 1, pair + 1, previousPair, pair + 1, pair);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `corridor:${corridor.id}`;
  mesh.receiveShadow = true;
  return mesh;
}

export function compileCorridorJunctions(
  corridors: readonly RoadCorridorDefinition[],
): CorridorJunction[] {
  const junctions: CorridorJunction[] = [];
  for (let firstIndex = 0; firstIndex < corridors.length; firstIndex++) {
    const first = corridors[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < corridors.length; secondIndex++) {
      const second = corridors[secondIndex];
      for (let firstSegment = 1; firstSegment < first.points.length; firstSegment++) {
        for (let secondSegment = 1; secondSegment < second.points.length; secondSegment++) {
          const intersection = segmentIntersection(
            first.points[firstSegment - 1],
            first.points[firstSegment],
            second.points[secondSegment - 1],
            second.points[secondSegment],
          );
          if (!intersection) continue;
          addJunction(junctions, {
            ...intersection,
            radius: Math.max(
              first.width * (first.junctionScale ?? 0.85),
              second.width * (second.junctionScale ?? 0.85),
            ),
          });
        }
      }
    }
  }
  return mergeOverlappingJunctions(junctions);
}

export function addJunctionBatch(
  scene: THREE.Object3D,
  junctions: readonly CorridorJunction[],
  corridors: readonly RoadCorridorDefinition[],
  material: THREE.Material,
  elevation: number,
) {
  if (junctions.length === 0) return;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const junction of junctions) {
    const boundary = junctionBoundary(junction, corridors);
    const centerIndex = positions.length / 3;
    positions.push(junction.x, elevation, junction.z);
    boundary.forEach((point) => positions.push(point.x, elevation, point.z));
    for (let index = 0; index < boundary.length; index++) {
      indices.push(centerIndex, centerIndex + 1 + (index + 1) % boundary.length, centerIndex + 1 + index);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "corridor-junctions";
  mesh.receiveShadow = true;
  scene.add(mesh);
}

export function corridorMarks(
  corridor: RoadCorridorDefinition,
  junctions: readonly CorridorJunction[] = [],
): RoadMarkDefinition[] {
  if (!corridor.markings) return [];
  const marks: RoadMarkDefinition[] = [];
  const step = corridor.markings === "taxiway" ? 13 : 7;
  for (let index = 1; index < corridor.points.length; index++) {
    const start = corridor.points[index - 1];
    const end = corridor.points[index];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    const heading = Math.atan2(dx, dz);
    const dashLength = corridor.markings === "taxiway" ? 5.5 : 3.3;
    for (let distance = step / 2; distance < length - step / 3; distance += step) {
      const centerX = start.x + dx * distance / length;
      const centerZ = start.z + dz * distance / length;
      const insideJunction = junctions.some((junction) => (
        (centerX - junction.x) ** 2 + (centerZ - junction.z) ** 2
          <= (junction.radius + dashLength * 0.55) ** 2
      ));
      if (insideJunction) continue;
      if (corridor.markings === "taxiway") {
        const edge = corridor.width / 2 - 0.8;
        const rightX = dz / length;
        const rightZ = -dx / length;
        for (const side of [-1, 1]) {
          marks.push({
            x: centerX + rightX * edge * side,
            z: centerZ + rightZ * edge * side,
            width: 0.16,
            depth: dashLength,
            rotation: heading,
          });
        }
      } else {
        marks.push({
          x: centerX,
          z: centerZ,
          width: 0.12,
          depth: dashLength,
          rotation: heading,
        });
      }
    }
  }
  return marks;
}

export function addMarkingBatch(
  scene: THREE.Object3D,
  marks: readonly RoadMarkDefinition[],
  material: THREE.Material,
  name: string,
) {
  if (marks.length === 0) return;
  const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.018, 1), material, marks.length);
  instances.name = name;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  marks.forEach((mark, index) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), mark.rotation ?? 0);
    scale.set(mark.width, 1, mark.depth);
    matrix.compose(new THREE.Vector3(mark.x, 0.145, mark.z), quaternion, scale);
    instances.setMatrixAt(index, matrix);
  });
  instances.instanceMatrix.needsUpdate = true;
  instances.computeBoundingSphere();
  scene.add(instances);
}

function splitCorridorAtJunctions(
  corridor: RoadCorridorDefinition,
  junctions: readonly CorridorJunction[],
) {
  const measurements = corridorMeasurements(corridor);
  const cuts = junctions.flatMap((junction) => junctionDistances(corridor, junction).map((distance) => ({
    start: Math.max(0, distance - junction.radius),
    end: Math.min(measurements.total, distance + junction.radius),
  }))).sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const cut of cuts) {
    const previous = merged[merged.length - 1];
    if (previous && cut.start <= previous.end) previous.end = Math.max(previous.end, cut.end);
    else merged.push({ ...cut });
  }
  const intervals: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const cut of merged) {
    if (cut.start - cursor > 0.25) intervals.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (measurements.total - cursor > 0.25) intervals.push({ start: cursor, end: measurements.total });
  if (intervals.length === 0 && cuts.length === 0) intervals.push({ start: 0, end: measurements.total });
  return intervals.map((interval) => ({
    points: corridorPointsBetween(corridor, measurements.cumulative, interval.start, interval.end),
    extendStart: interval.start < 0.001,
    extendEnd: interval.end > measurements.total - 0.001,
  })).filter((section) => section.points.length >= 2);
}

function junctionBoundary(
  junction: CorridorJunction,
  corridors: readonly RoadCorridorDefinition[],
) {
  const points: Point2[] = [];
  for (const corridor of corridors) {
    const measurements = corridorMeasurements(corridor);
    for (const distance of junctionDistances(corridor, junction)) {
      for (const boundaryDistance of [distance - junction.radius, distance + junction.radius]) {
        if (boundaryDistance < 0 || boundaryDistance > measurements.total) continue;
        const sample = sampleCorridorAtDistance(corridor, measurements.cumulative, boundaryDistance);
        if (!sample) continue;
        const right = { x: sample.tangent.z, z: -sample.tangent.x };
        points.push(
          {
            x: sample.point.x + right.x * corridor.width / 2,
            z: sample.point.z + right.z * corridor.width / 2,
          },
          {
            x: sample.point.x - right.x * corridor.width / 2,
            z: sample.point.z - right.z * corridor.width / 2,
          },
        );
      }
    }
  }
  const unique = points.filter((point, index) => points.findIndex((candidate) => (
    (candidate.x - point.x) ** 2 + (candidate.z - point.z) ** 2 < 0.04
  )) === index);
  if (unique.length < 3) {
    return Array.from({ length: 18 }, (_, index) => {
      const angle = index / 18 * Math.PI * 2;
      return {
        x: junction.x + Math.cos(angle) * junction.radius,
        z: junction.z + Math.sin(angle) * junction.radius,
      };
    });
  }
  return convexHull(unique);
}

function convexHull(points: readonly Point2[]) {
  const sorted = [...points].sort((first, second) => first.x - second.x || first.z - second.z);
  const cross = (origin: Point2, first: Point2, second: Point2) => (
    (first.x - origin.x) * (second.z - origin.z)
      - (first.z - origin.z) * (second.x - origin.x)
  );
  const lower: Point2[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Point2[] = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

type Point2 = { x: number; z: number };

function corridorMeasurements(corridor: RoadCorridorDefinition) {
  const cumulative = [0];
  for (let index = 1; index < corridor.points.length; index++) {
    cumulative.push(cumulative[index - 1] + Math.hypot(
      corridor.points[index].x - corridor.points[index - 1].x,
      corridor.points[index].z - corridor.points[index - 1].z,
    ));
  }
  return { cumulative, total: cumulative[cumulative.length - 1] };
}

function junctionDistances(corridor: RoadCorridorDefinition, junction: CorridorJunction) {
  const measurements = corridorMeasurements(corridor);
  const distances: number[] = [];
  for (let index = 1; index < corridor.points.length; index++) {
    const start = corridor.points[index - 1];
    const end = corridor.points[index];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    const amount = THREE.MathUtils.clamp(
      ((junction.x - start.x) * dx + (junction.z - start.z) * dz) / lengthSquared,
      0,
      1,
    );
    const closestX = start.x + dx * amount;
    const closestZ = start.z + dz * amount;
    if ((closestX - junction.x) ** 2 + (closestZ - junction.z) ** 2 > junction.radius ** 2) continue;
    const distance = measurements.cumulative[index - 1] + Math.sqrt(lengthSquared) * amount;
    if (!distances.some((candidate) => Math.abs(candidate - distance) < 0.1)) distances.push(distance);
  }
  return distances;
}

function corridorPointsBetween(
  corridor: RoadCorridorDefinition,
  cumulative: readonly number[],
  start: number,
  end: number,
) {
  const first = sampleCorridorAtDistance(corridor, cumulative, start)?.point;
  const last = sampleCorridorAtDistance(corridor, cumulative, end)?.point;
  if (!first || !last) return [];
  const points: Point2[] = [first];
  for (let index = 1; index < corridor.points.length - 1; index++) {
    if (cumulative[index] > start + 0.001 && cumulative[index] < end - 0.001) {
      points.push(corridor.points[index]);
    }
  }
  points.push(last);
  return points;
}

function sampleCorridorAtDistance(
  corridor: RoadCorridorDefinition,
  cumulative: readonly number[],
  distance: number,
) {
  for (let index = 1; index < corridor.points.length; index++) {
    if (distance > cumulative[index] + 0.001) continue;
    const start = corridor.points[index - 1];
    const end = corridor.points[index];
    const segmentLength = cumulative[index] - cumulative[index - 1];
    const amount = segmentLength > 0 ? (distance - cumulative[index - 1]) / segmentLength : 0;
    return {
      point: {
        x: THREE.MathUtils.lerp(start.x, end.x, amount),
        z: THREE.MathUtils.lerp(start.z, end.z, amount),
      },
      tangent: {
        x: (end.x - start.x) / segmentLength,
        z: (end.z - start.z) / segmentLength,
      },
    };
  }
  return null;
}

function mergeOverlappingJunctions(source: readonly CorridorJunction[]) {
  const merged = source.map((junction) => ({ ...junction }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let firstIndex = 0; firstIndex < merged.length; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < merged.length; secondIndex++) {
        const first = merged[firstIndex];
        const second = merged[secondIndex];
        const dx = second.x - first.x;
        const dz = second.z - first.z;
        const distance = Math.hypot(dx, dz);
        if (distance > (first.radius + second.radius) * 0.82) continue;
        const radius = (distance + first.radius + second.radius) / 2;
        const shift = distance > 0.001 ? (radius - first.radius) / distance : 0;
        merged[firstIndex] = {
          x: first.x + dx * shift,
          z: first.z + dz * shift,
          radius,
        };
        merged.splice(secondIndex, 1);
        changed = true;
        break outer;
      }
    }
  }
  return merged;
}

function addJunction(junctions: CorridorJunction[], candidate: CorridorJunction) {
  const existing = junctions.find((junction) => (
    (junction.x - candidate.x) ** 2 + (junction.z - candidate.z) ** 2 < 4
  ));
  if (existing) {
    existing.radius = Math.max(existing.radius, candidate.radius);
    return;
  }
  junctions.push(candidate);
}

function segmentIntersection(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
  d: { x: number; z: number },
) {
  const abX = b.x - a.x;
  const abZ = b.z - a.z;
  const cdX = d.x - c.x;
  const cdZ = d.z - c.z;
  const denominator = abX * cdZ - abZ * cdX;
  if (Math.abs(denominator) < 0.0001) {
    for (const first of [a, b]) {
      for (const second of [c, d]) {
        if ((first.x - second.x) ** 2 + (first.z - second.z) ** 2 < 0.01) {
          return { x: (first.x + second.x) / 2, z: (first.z + second.z) / 2 };
        }
      }
    }
    return null;
  }
  const acX = c.x - a.x;
  const acZ = c.z - a.z;
  const firstAmount = (acX * cdZ - acZ * cdX) / denominator;
  const secondAmount = (acX * abZ - acZ * abX) / denominator;
  const epsilon = 0.0001;
  if (
    firstAmount < -epsilon || firstAmount > 1 + epsilon
    || secondAmount < -epsilon || secondAmount > 1 + epsilon
  ) return null;
  return { x: a.x + abX * firstAmount, z: a.z + abZ * firstAmount };
}

function normalize(x: number, z: number) {
  const length = Math.hypot(x, z);
  if (length < 0.0001) return new MutablePoint(0, 1);
  return new MutablePoint(x / length, z / length);
}

class MutablePoint {
  constructor(public x: number, public z: number) {}
  set(x: number, z: number) {
    this.x = x;
    this.z = z;
  }
}
