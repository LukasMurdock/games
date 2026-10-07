import type { Point2, StampPlacement } from "./authoring";
import type { RoadCorridorDefinition } from "./types";

/** Corridor segments must be at least this long; curves are sampled no finer. */
export const MINIMUM_SEGMENT = 5;
const CURVE_STEP = MINIMUM_SEGMENT;

/**
 * Turtle-style road authoring. Headings use the game's yaw convention: forward is
 * (sin heading, cos heading), and positive angles turn toward local +x (to the right
 * when looking down +z). Every curve is sampled at drivable, validator-safe spacing.
 */
export function roadPath(start: Point2, heading = 0) {
  const points: Point2[] = [{ ...start }];
  let x = start.x;
  let z = start.z;
  let yaw = heading;

  const api = {
    straight(length: number) {
      x += Math.sin(yaw) * length;
      z += Math.cos(yaw) * length;
      points.push({ x, z });
      return api;
    },
    /** Turns through `degrees` on a circle of `radius`; positive turns right (toward +x at yaw 0). */
    arc(radius: number, degrees: number) {
      const angle = degrees * Math.PI / 180;
      const length = Math.abs(angle) * radius;
      const steps = Math.max(1, Math.floor(length / CURVE_STEP));
      const side = Math.sign(angle) || 1;
      // Center lies to the turning side, perpendicular to the current heading.
      const centerX = x + Math.cos(yaw) * radius * side;
      const centerZ = z - Math.sin(yaw) * radius * side;
      const startAngle = Math.atan2(x - centerX, z - centerZ);
      for (let step = 1; step <= steps; step++) {
        const swept = angle * step / steps;
        const around = startAngle + swept;
        points.push({ x: centerX + Math.sin(around) * radius, z: centerZ + Math.cos(around) * radius });
      }
      yaw += angle;
      const last = points[points.length - 1];
      x = last.x;
      z = last.z;
      return api;
    },
    /** Shifts the road sideways by `offset` over `length` with two opposed arcs; positive moves right. */
    sBend(length: number, offset: number) {
      const theta = 2 * Math.atan(Math.abs(offset) / length);
      const radius = length / (2 * Math.sin(theta));
      const degrees = theta * 180 / Math.PI * Math.sign(offset);
      return api.arc(radius, degrees).arc(radius, -degrees);
    },
    /** Out-and-back sideways jink that returns to the original line. */
    chicane(length: number, offset: number) {
      return api.sBend(length / 2, offset).sBend(length / 2, -offset);
    },
    /** Alternating 180° hairpins joined by straight legs, climbing sideways like a mountain road. */
    switchbacks(count: number, legLength: number, radius: number, firstTurn: 1 | -1 = 1) {
      let turn = firstTurn;
      for (let index = 0; index < count; index++) {
        api.straight(legLength).arc(radius, 180 * turn);
        turn = turn === 1 ? -1 : 1;
      }
      return api.straight(legLength);
    },
    get end() { return { x, z, heading: yaw }; },
    points() { return cleanPoints(points); },
  };
  return api;
}

/**
 * A point roads must not swing toward: any corridor passing within `near` of it stays on
 * its authored line for `radius` either side of the closest approach.
 */
type KeepPoint = Point2 & { radius?: number; near?: number };

export type ShapeNetworkOptions = {
  seed: number;
  /** Runs shorter than this between anchors stay straight. */
  minimumRun?: number;
  /** Lateral amplitude as a fraction of run length, capped by `maximumAmplitude`. */
  amplitudeRatio?: number;
  maximumAmplitude?: number;
  /** Corner fillet radius applied to sharp, unconnected corridor corners. */
  filletRadius?: number;
  /** Points the reshaped roads must still pass straight through (spawns, landmarks). */
  keepPoints?: readonly KeepPoint[];
  /** Corridor ids to leave exactly as authored. */
  preserve?: readonly string[];
};

/**
 * Reshapes an authored network into a more drivable one without changing its topology:
 * sharp, unconnected corners become drift arcs, and long runs between anchors become
 * sweepers, bulges, and S-bends. Anchors are corridor ends, crossings with other
 * corridors, district frontages, and keep points; the road stays on its original line
 * through each anchor so junctions, entrances, and spawns still line up. District
 * placements are returned with their along-corridor distances remapped.
 */
export function shapeNetwork(
  sourceCorridors: readonly RoadCorridorDefinition[],
  sourceDistricts: readonly StampPlacement[],
  options: ShapeNetworkOptions,
) {
  const random = mulberry32(options.seed);
  const minimumRun = options.minimumRun ?? 95;
  const amplitudeRatio = options.amplitudeRatio ?? 0.12;
  const maximumAmplitude = options.maximumAmplitude ?? 34;
  const filletRadius = options.filletRadius ?? 34;
  const preserve = new Set(options.preserve ?? []);
  const remaps = new Map<string, Array<{ from: number; to: number }>>();
  // District parcels sit beside their host road. Bends may pass them, but never closer
  // than the parcel's clearance (or the road's original distance, if that was closer).
  const blockers: Array<Point2 & { clearance: number }> = sourceDistricts.map((district) => {
    if (district.kind === "absolute") return { ...district.at, clearance: stampExtent(district.stamp) / 2 + 14 };
    const host = sourceCorridors.find((corridor) => corridor.id === district.corridor);
    if (!host) return { x: 0, z: 0, clearance: 0 };
    const cumulative = cumulativeLengths(host.points);
    const at = sampleAt(host.points, cumulative, district.distance);
    const ahead = sampleAt(host.points, cumulative, district.distance + 1);
    const tangent = normalize(ahead.x - at.x, ahead.z - at.z);
    const side = district.side === "right" ? 1 : -1;
    const size = stampExtent(district.stamp);
    const offset = host.width / 2 + district.setback + size / 2;
    return { x: at.x + tangent.z * side * offset, z: at.z - tangent.x * side * offset, clearance: size / 2 + 14 };
  });
  const keepPoints = options.keepPoints ?? [];
  const intrudes = (point: Point2, base: Point2) => blockers.some((blocker) => {
    const distance = Math.hypot(point.x - blocker.x, point.z - blocker.z);
    const baseDistance = Math.hypot(base.x - blocker.x, base.z - blocker.z);
    return distance < Math.min(blocker.clearance, baseDistance) - 0.5;
  });

  const corridors = sourceCorridors.map((corridor) => {
    if (preserve.has(corridor.id)) {
      const length = polylineLength(corridor.points);
      remaps.set(corridor.id, [{ from: 0, to: 0 }, { from: length, to: length }]);
      return corridor;
    }
    const others = sourceCorridors.filter((other) => other.id !== corridor.id);
    const cumulative = cumulativeLengths(corridor.points);
    const total = cumulative[cumulative.length - 1];

    // Anchor zones in along-corridor distance: [start, end] spans that must stay on the line.
    const zones: Array<[number, number]> = [[0, 0], [total, total]];
    const junctionClearance = corridor.width + 10;
    for (const other of others) {
      for (const hit of crossings(corridor.points, other.points, cumulative)) {
        const clearance = Math.max(junctionClearance, other.width + 10);
        zones.push([hit - clearance, hit + clearance]);
      }
      // A neighbor's end that touches this corridor is also a junction.
      for (const end of [other.points[0], other.points[other.points.length - 1]]) {
        const projection = projectOnto(corridor.points, cumulative, end);
        if (projection.distance <= corridor.width / 2 + other.width / 2 + 2) {
          const clearance = Math.max(junctionClearance, other.width + 10);
          zones.push([projection.along - clearance, projection.along + clearance]);
        }
      }
    }
    for (const district of sourceDistricts) {
      if (district.kind !== "corridor" || district.corridor !== corridor.id) continue;
      // Enough straight frontage for the stamp's entrances and the parcel's road edge.
      const reach = 52 + Math.max(0, ...district.entranceOffsets.map(Math.abs));
      zones.push([district.distance - reach, district.distance + reach]);
    }
    for (const keep of keepPoints) {
      const projection = projectOnto(corridor.points, cumulative, keep);
      if (projection.distance <= (keep.near ?? 0) + corridor.width / 2 + 6) {
        const reach = keep.radius ?? 45;
        zones.push([projection.along - reach, projection.along + reach]);
      }
    }
    // Original vertices anchor the shape unless they are filleted below.
    const filletable = new Set<number>();
    for (let index = 1; index < corridor.points.length - 1; index++) {
      const vertex = corridor.points[index];
      const turn = Math.abs(turnAt(corridor.points, index));
      const connected = others.some((other) => distanceToPolyline(other.points, vertex) < corridor.width + other.width);
      if (turn > 20 * Math.PI / 180 && !connected) filletable.add(index);
      else zones.push([cumulative[index] - corridor.width, cumulative[index] + corridor.width]);
    }

    const anchors = mergeZones(zones, total);
    const shaped: Point2[] = [];
    const map: Array<{ from: number; to: number }> = [];
    const push = (point: Point2, from: number) => {
      const previous = shaped[shaped.length - 1];
      if (previous && Math.hypot(point.x - previous.x, point.z - previous.z) < MINIMUM_SEGMENT) return;
      shaped.push(point);
      map.push({ from, to: polylineLength(shaped) });
    };

    // Walk the original corridor in distance, emitting anchor spans verbatim and
    // meandering the free runs between them.
    for (let anchorIndex = 0; anchorIndex < anchors.length; anchorIndex++) {
      const [anchorStart, anchorEnd] = anchors[anchorIndex];
      for (const distance of spanSamples(cumulative, anchorStart, anchorEnd)) {
        push(sampleAt(corridor.points, cumulative, distance), distance);
      }
      const next = anchors[anchorIndex + 1];
      if (!next) break;
      const runStart = anchorEnd;
      const runEnd = next[0];
      const run = runEnd - runStart;
      if (run <= 0) continue;
      const straightRun = !spanHasVertex(cumulative, runStart, runEnd, filletable);
      if (run < minimumRun || !straightRun) {
        // Too short to meander, or it contains a corner: fillet corners and keep the line.
        for (const distance of filletedSamples(corridor.points, cumulative, runStart, runEnd, filletable, filletRadius)) {
          push(distance.point, distance.along);
        }
        continue;
      }
      const preferredSign = random() < 0.5 ? -1 : 1;
      const pattern = random();
      const steps = Math.max(2, Math.ceil(run / CURVE_STEP));
      const start = sampleAt(corridor.points, cumulative, runStart);
      const end = sampleAt(corridor.points, cumulative, runEnd);
      const tangent = normalize(end.x - start.x, end.z - start.z);
      const normal = { x: tangent.z, z: -tangent.x };
      const meander = (amplitude: number) => {
        const samples: Array<{ point: Point2; along: number }> = [];
        for (let step = 1; step < steps; step++) {
          const t = step / steps;
          // Both shapes leave and rejoin the anchors tangentially (zero end slope).
          const lateral = pattern < 0.45
            ? (1 - Math.cos(2 * Math.PI * t)) / 2
            : (Math.sin(2 * Math.PI * t) - Math.sin(4 * Math.PI * t) / 2) / 1.299;
          const along = runStart + run * t;
          const base = sampleAt(corridor.points, cumulative, along);
          const point = { x: base.x + normal.x * amplitude * lateral, z: base.z + normal.z * amplitude * lateral };
          if (intrudes(point, base)) return null;
          samples.push({ point, along });
        }
        return samples;
      };
      // Prefer the seeded direction, then the other side, then progressively gentler bends.
      const full = Math.min(maximumAmplitude, run * amplitudeRatio);
      let chosen: Array<{ point: Point2; along: number }> | null = null;
      for (const scale of [1, 0.6, 0.35]) {
        chosen = meander(full * scale * preferredSign) ?? meander(-full * scale * preferredSign);
        if (chosen) break;
      }
      for (const sample of chosen ?? [{ point: end, along: runEnd }]) push(sample.point, sample.along);
    }
    const last = corridor.points[corridor.points.length - 1];
    const tail = shaped[shaped.length - 1];
    if (Math.hypot(last.x - tail.x, last.z - tail.z) > 0.01) {
      // Keep the exact endpoint so terminal junctions stay connected.
      if (Math.hypot(last.x - tail.x, last.z - tail.z) < MINIMUM_SEGMENT) {
        shaped.pop();
        map.pop();
      }
      shaped.push({ ...last });
      map.push({ from: total, to: polylineLength(shaped) });
    }
    remaps.set(corridor.id, map);
    return { ...corridor, points: shaped };
  });

  const remapDistance = (corridorId: string, distance: number) => {
    const map = remaps.get(corridorId);
    if (!map) return distance;
    for (let index = 1; index < map.length; index++) {
      if (distance <= map[index].from) {
        const previous = map[index - 1];
        const span = map[index].from - previous.from || 1;
        return previous.to + (map[index].to - previous.to) * (distance - previous.from) / span;
      }
    }
    return map[map.length - 1].to;
  };
  const districts = sourceDistricts.map((district) => district.kind === "corridor"
    ? { ...district, distance: remapDistance(district.corridor, district.distance) }
    : district);
  return { corridors, districts, remapDistance };
}

/** Largest footprint dimension of a stamp, from its rectangles. */
function stampExtent(stamp: StampPlacement["stamp"]) {
  let extent = 20;
  for (const item of [...(stamp.parkingLots ?? []), ...(stamp.buildings ?? []), ...(stamp.groundPatches ?? [])]) {
    extent = Math.max(extent, Math.abs(item.x) * 2 + Math.max(item.width, item.depth));
    extent = Math.max(extent, Math.abs(item.z) * 2 + Math.max(item.width, item.depth));
  }
  return extent;
}

function mergeZones(zones: Array<[number, number]>, total: number) {
  const clamped = zones
    .map(([start, end]) => [Math.max(0, start), Math.min(total, end)] as [number, number])
    .sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const zone of clamped) {
    const last = merged[merged.length - 1];
    if (last && zone[0] <= last[1] + 1) last[1] = Math.max(last[1], zone[1]);
    else merged.push([...zone]);
  }
  return merged;
}

/** Original vertices inside an anchored span, plus its ends. */
function spanSamples(cumulative: readonly number[], start: number, end: number) {
  const samples = [start];
  for (let index = 1; index < cumulative.length - 1; index++) {
    if (cumulative[index] > start && cumulative[index] < end) samples.push(cumulative[index]);
  }
  if (end > start) samples.push(end);
  return samples;
}

function spanHasVertex(cumulative: readonly number[], start: number, end: number, vertices: Set<number>) {
  for (const index of vertices) if (cumulative[index] > start && cumulative[index] < end) return true;
  return false;
}

/** Samples a run along the original line, replacing filletable corners with arcs. */
function filletedSamples(
  points: readonly Point2[],
  cumulative: readonly number[],
  start: number,
  end: number,
  filletable: Set<number>,
  radius: number,
) {
  const samples: Array<{ point: Point2; along: number }> = [];
  for (let index = 1; index < points.length - 1; index++) {
    const along = cumulative[index];
    if (along <= start || along >= end) continue;
    if (!filletable.has(index)) {
      samples.push({ point: points[index], along });
      continue;
    }
    const previous = points[index - 1];
    const vertex = points[index];
    const next = points[index + 1];
    const incoming = normalize(vertex.x - previous.x, vertex.z - previous.z);
    const outgoing = normalize(next.x - vertex.x, next.z - vertex.z);
    const turn = Math.acos(Math.max(-1, Math.min(1, incoming.x * outgoing.x + incoming.z * outgoing.z)));
    // Tangent length limited so the arc fits within the run and adjacent segments.
    const maximumTangent = Math.min(along - start, end - along, cumulative[index] - cumulative[index - 1], cumulative[index + 1] - cumulative[index]) * 0.45;
    const tangentLength = Math.min(radius * Math.tan(turn / 2), maximumTangent);
    const effectiveRadius = tangentLength / Math.tan(turn / 2);
    const arcStart = { x: vertex.x - incoming.x * tangentLength, z: vertex.z - incoming.z * tangentLength };
    const steps = Math.max(2, Math.ceil(effectiveRadius * turn / CURVE_STEP));
    const cross = incoming.x * outgoing.z - incoming.z * outgoing.x;
    const side = cross > 0 ? -1 : 1;
    const centerX = arcStart.x + incoming.z * effectiveRadius * side;
    const centerZ = arcStart.z - incoming.x * effectiveRadius * side;
    const startAngle = Math.atan2(arcStart.x - centerX, arcStart.z - centerZ);
    const sweep = turn * (cross > 0 ? -1 : 1);
    for (let step = 0; step <= steps; step++) {
      const around = startAngle + sweep * step / steps;
      samples.push({
        point: { x: centerX + Math.sin(around) * effectiveRadius, z: centerZ + Math.cos(around) * effectiveRadius },
        along: along - tangentLength + (2 * tangentLength) * step / steps,
      });
    }
  }
  samples.push({ point: sampleAt(points, cumulative, end), along: end });
  return samples;
}

function crossings(points: readonly Point2[], other: readonly Point2[], cumulative: readonly number[]) {
  const hits: number[] = [];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    for (let otherIndex = 1; otherIndex < other.length; otherIndex++) {
      const hit = segmentIntersection(a, b, other[otherIndex - 1], other[otherIndex]);
      if (hit !== null) hits.push(cumulative[index - 1] + hit * (cumulative[index] - cumulative[index - 1]));
    }
  }
  return hits;
}

function segmentIntersection(a: Point2, b: Point2, c: Point2, d: Point2) {
  const rX = b.x - a.x;
  const rZ = b.z - a.z;
  const sX = d.x - c.x;
  const sZ = d.z - c.z;
  const denominator = rX * sZ - rZ * sX;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((c.x - a.x) * sZ - (c.z - a.z) * sX) / denominator;
  const u = ((c.x - a.x) * rZ - (c.z - a.z) * rX) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

function projectOnto(points: readonly Point2[], cumulative: readonly number[], target: Point2) {
  let best = { distance: Number.POSITIVE_INFINITY, along: 0 };
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.z - a.z) * dz) / lengthSquared));
    const distance = Math.hypot(a.x + dx * t - target.x, a.z + dz * t - target.z);
    if (distance < best.distance) best = { distance, along: cumulative[index - 1] + t * Math.sqrt(lengthSquared) };
  }
  return best;
}

function distanceToPolyline(points: readonly Point2[], target: Point2) {
  return projectOnto(points, cumulativeLengths(points), target).distance;
}

function turnAt(points: readonly Point2[], index: number) {
  const previous = points[index - 1];
  const vertex = points[index];
  const next = points[index + 1];
  const incoming = Math.atan2(vertex.x - previous.x, vertex.z - previous.z);
  const outgoing = Math.atan2(next.x - vertex.x, next.z - vertex.z);
  return Math.atan2(Math.sin(outgoing - incoming), Math.cos(outgoing - incoming));
}

function cumulativeLengths(points: readonly Point2[]) {
  const lengths = [0];
  for (let index = 1; index < points.length; index++) {
    lengths.push(lengths[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z));
  }
  return lengths;
}

function polylineLength(points: readonly Point2[]) {
  const lengths = cumulativeLengths(points);
  return lengths[lengths.length - 1];
}

function sampleAt(points: readonly Point2[], cumulative: readonly number[], distance: number): Point2 {
  const clamped = Math.max(0, Math.min(cumulative[cumulative.length - 1], distance));
  for (let index = 1; index < points.length; index++) {
    if (clamped <= cumulative[index]) {
      const span = cumulative[index] - cumulative[index - 1] || 1;
      const t = (clamped - cumulative[index - 1]) / span;
      return {
        x: points[index - 1].x + (points[index].x - points[index - 1].x) * t,
        z: points[index - 1].z + (points[index].z - points[index - 1].z) * t,
      };
    }
  }
  return { ...points[points.length - 1] };
}

function cleanPoints(points: readonly Point2[]) {
  const cleaned: Point2[] = [points[0]];
  for (let index = 1; index < points.length; index++) {
    const previous = cleaned[cleaned.length - 1];
    const point = points[index];
    const isLast = index === points.length - 1;
    if (Math.hypot(point.x - previous.x, point.z - previous.z) >= MINIMUM_SEGMENT) cleaned.push(point);
    else if (isLast && cleaned.length > 1) cleaned[cleaned.length - 1] = point;
  }
  return cleaned;
}

function normalize(x: number, z: number) {
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
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
