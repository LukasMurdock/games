import type {
  AuthoritativeDrivingPlayer,
  AuthoritativeDrivingSnapshot,
} from "./simulation";

type BufferedSnapshot = {
  tick: number;
  receivedAt: number;
  snapshot: AuthoritativeDrivingSnapshot;
};

export type DrivingInterpolationOptions = {
  tickRate?: number;
  interpolationDelaySeconds?: number;
  maximumExtrapolationSeconds?: number;
  maximumSnapshots?: number;
  now?: () => number;
};

export class DrivingSnapshotBuffer {
  private readonly tickRate: number;
  private readonly delayTicks: number;
  private readonly maximumExtrapolationTicks: number;
  private readonly maximumSnapshots: number;
  private readonly now: () => number;
  private readonly snapshots: BufferedSnapshot[] = [];

  constructor(options: DrivingInterpolationOptions = {}) {
    this.tickRate = options.tickRate ?? 60;
    this.delayTicks = (options.interpolationDelaySeconds ?? 0.1) * this.tickRate;
    this.maximumExtrapolationTicks = (options.maximumExtrapolationSeconds ?? 0.1) * this.tickRate;
    this.maximumSnapshots = options.maximumSnapshots ?? 32;
    this.now = options.now ?? (() => performance.now());
    if (this.tickRate <= 0 || this.maximumSnapshots < 2) {
      throw new Error("DrivingSnapshotBuffer requires a positive tick rate and at least two snapshots.");
    }
  }

  get size() {
    return this.snapshots.length;
  }

  clear() {
    this.snapshots.length = 0;
  }

  push(tick: number, snapshot: AuthoritativeDrivingSnapshot, receivedAt = this.now()) {
    if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isFinite(receivedAt)) return;
    const existing = this.snapshots.findIndex((entry) => entry.tick === tick);
    const entry = { tick, receivedAt, snapshot: cloneSnapshot(snapshot) };
    if (existing >= 0) this.snapshots[existing] = entry;
    else {
      const insertion = this.snapshots.findIndex((candidate) => candidate.tick > tick);
      if (insertion < 0) this.snapshots.push(entry);
      else this.snapshots.splice(insertion, 0, entry);
    }
    while (this.snapshots.length > this.maximumSnapshots) this.snapshots.shift();
  }

  sample(now = this.now()): AuthoritativeDrivingSnapshot | null {
    const latest = this.snapshots.at(-1);
    if (!latest) return null;
    const elapsedTicks = Math.max(0, now - latest.receivedAt) / 1000 * this.tickRate;
    const targetTick = latest.tick + elapsedTicks - this.delayTicks;
    const first = this.snapshots[0];
    if (targetTick <= first.tick) return cloneSnapshot(first.snapshot);

    for (let index = 1; index < this.snapshots.length; index++) {
      const right = this.snapshots[index];
      if (right.tick < targetTick) continue;
      const left = this.snapshots[index - 1];
      const span = right.tick - left.tick;
      const alpha = span > 0 ? (targetTick - left.tick) / span : 1;
      return interpolateSnapshot(left.snapshot, right.snapshot, alpha);
    }

    const extrapolationTicks = Math.min(
      Math.max(0, targetTick - latest.tick),
      this.maximumExtrapolationTicks,
    );
    return extrapolateSnapshot(latest.snapshot, extrapolationTicks / this.tickRate);
  }
}

export function interpolateSnapshot(
  left: AuthoritativeDrivingSnapshot,
  right: AuthoritativeDrivingSnapshot,
  alpha: number,
): AuthoritativeDrivingSnapshot {
  const amount = clamp(alpha, 0, 1);
  const rightPlayers = new Map(right.players.map((player) => [player.playerId, player]));
  const players: AuthoritativeDrivingPlayer[] = [];
  for (const leftPlayer of left.players) {
    const rightPlayer = rightPlayers.get(leftPlayer.playerId);
    if (!rightPlayer) {
      if (amount < 1) players.push(clonePlayer(leftPlayer));
      continue;
    }
    rightPlayers.delete(leftPlayer.playerId);
    players.push({
      playerId: leftPlayer.playerId,
      position: lerpVec2(leftPlayer.position, rightPlayer.position, amount),
      velocity: lerpVec2(leftPlayer.velocity, rightPlayer.velocity, amount),
      heading: lerpAngle(leftPlayer.heading, rightPlayer.heading, amount),
      speed: lerp(leftPlayer.speed, rightPlayer.speed, amount),
      visualSlip: lerpAngle(leftPlayer.visualSlip, rightPlayer.visualSlip, amount),
      driftPhase: amount < 0.5 ? leftPlayer.driftPhase : rightPlayer.driftPhase,
      boosting: amount < 0.5 ? leftPlayer.boosting : rightPlayer.boosting,
      exitPulse: lerp(leftPlayer.exitPulse, rightPlayer.exitPulse, amount),
    });
  }
  if (amount >= 1) {
    for (const player of rightPlayers.values()) players.push(clonePlayer(player));
  }
  players.sort((leftPlayer, rightPlayer) => leftPlayer.playerId.localeCompare(rightPlayer.playerId));
  return { players };
}

function extrapolateSnapshot(
  snapshot: AuthoritativeDrivingSnapshot,
  seconds: number,
): AuthoritativeDrivingSnapshot {
  return {
    players: snapshot.players.map((player) => ({
      ...clonePlayer(player),
      position: [
        player.position[0] + player.velocity[0] * seconds,
        player.position[1] + player.velocity[1] * seconds,
      ] as [number, number],
    })),
  };
}

function cloneSnapshot(snapshot: AuthoritativeDrivingSnapshot): AuthoritativeDrivingSnapshot {
  return { players: snapshot.players.map(clonePlayer) };
}
function clonePlayer(player: AuthoritativeDrivingPlayer): AuthoritativeDrivingPlayer {
  return {
    ...player,
    position: [...player.position],
    velocity: [...player.velocity],
  };
}
function lerpVec2(left: [number, number], right: [number, number], amount: number): [number, number] {
  return [lerp(left[0], right[0], amount), lerp(left[1], right[1], amount)];
}
function lerpAngle(left: number, right: number, amount: number) {
  const difference = Math.atan2(Math.sin(right - left), Math.cos(right - left));
  return normalizeAngle(left + difference * amount);
}
function normalizeAngle(value: number) { return Math.atan2(Math.sin(value), Math.cos(value)); }
function lerp(left: number, right: number, amount: number) { return left + (right - left) * amount; }
function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
