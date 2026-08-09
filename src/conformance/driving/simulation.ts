import type { GameSimulation } from "../../net/runtime/simulation";

export type DrivingConfig = {
  worldRadius?: number;
  acceleration?: number;
  maximumSpeed?: number;
  carRadius?: number;
  spawnSpacing?: number;
};

export type DrivingInput = {
  steering: number;
  throttle: number;
  brake: boolean;
  handbrake: boolean;
};

export type DrivingPlayerSnapshot = {
  playerId: string;
  position: [number, number];
  velocity: [number, number];
  heading: number;
  speed: number;
};

export type DrivingSnapshot = { players: DrivingPlayerSnapshot[] };

export type DrivingEvent =
  | { type: "joined"; playerId: string }
  | { type: "left"; playerId: string }
  | { type: "collision"; playerId: string; otherPlayerId?: string };

type DrivingPlayerState = {
  position: [number, number];
  velocity: [number, number];
  heading: number;
  input: DrivingInput;
};

export type DrivingState = {
  players: Map<string, DrivingPlayerState>;
  worldRadius: number;
  acceleration: number;
  maximumSpeed: number;
  carRadius: number;
  spawnSpacing: number;
  nextSpawn: number;
};

const IDLE_INPUT: DrivingInput = {
  steering: 0,
  throttle: 0,
  brake: false,
  handbrake: false,
};

export const drivingSimulation: GameSimulation<
  DrivingConfig,
  DrivingInput,
  DrivingState,
  DrivingSnapshot,
  DrivingEvent
> = {
  create(config) {
    return {
      players: new Map(),
      worldRadius: config.worldRadius ?? 100,
      acceleration: config.acceleration ?? 18,
      maximumSpeed: config.maximumSpeed ?? 28,
      carRadius: config.carRadius ?? 1.25,
      spawnSpacing: config.spawnSpacing ?? 5,
      nextSpawn: 0,
    };
  },

  addPlayer(state, playerId) {
    if (state.players.has(playerId)) throw new Error(`Player already exists: ${playerId}.`);
    const index = state.nextSpawn++;
    state.players.set(playerId, {
      position: [((index % 4) - 1.5) * state.spawnSpacing, Math.floor(index / 4) * state.spawnSpacing],
      velocity: [0, 0],
      heading: 0,
      input: { ...IDLE_INPUT },
    });
    return [{ type: "joined", playerId }];
  },

  removePlayer(state, playerId) {
    if (!state.players.delete(playerId)) return;
    return [{ type: "left", playerId }];
  },

  input(state, playerId, input) {
    const player = state.players.get(playerId);
    if (!player) return;
    player.input = sanitizeInput(input);
  },

  tick(state, dt) {
    const events: DrivingEvent[] = [];
    for (const [playerId, player] of state.players) {
      integratePlayer(state, player, dt);
      if (containPlayer(state, player)) events.push({ type: "collision", playerId });
    }
    resolvePlayerCollisions(state, events);
    return events;
  },

  snapshot(state) {
    return {
      players: [...state.players.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([playerId, player]) => ({
          playerId,
          position: [...player.position] as [number, number],
          velocity: [...player.velocity] as [number, number],
          heading: player.heading,
          speed: Math.hypot(...player.velocity),
        })),
    };
  },
};

function sanitizeInput(input: DrivingInput): DrivingInput {
  return {
    steering: clamp(finite(input.steering), -1, 1),
    throttle: clamp(finite(input.throttle), 0, 1),
    brake: input.brake === true,
    handbrake: input.handbrake === true,
  };
}

function integratePlayer(state: DrivingState, player: DrivingPlayerState, dt: number) {
  const forwardX = Math.sin(player.heading);
  const forwardZ = Math.cos(player.heading);
  let forwardSpeed = player.velocity[0] * forwardX + player.velocity[1] * forwardZ;
  forwardSpeed += player.input.throttle * state.acceleration * dt;
  if (player.input.brake) forwardSpeed = approach(forwardSpeed, 0, state.acceleration * 1.5 * dt);
  forwardSpeed = clamp(forwardSpeed, 0, state.maximumSpeed);

  const speedRatio = clamp(Math.abs(forwardSpeed) / 6, 0, 1);
  const turnRate = player.input.handbrake ? 2.25 : 1.55;
  player.heading = normalizeAngle(player.heading + player.input.steering * turnRate * speedRatio * dt);

  const nextForwardX = Math.sin(player.heading);
  const nextForwardZ = Math.cos(player.heading);
  const targetX = nextForwardX * forwardSpeed;
  const targetZ = nextForwardZ * forwardSpeed;
  const grip = player.input.handbrake ? 1.8 : 8;
  const gripBlend = 1 - Math.exp(-grip * dt);
  player.velocity[0] += (targetX - player.velocity[0]) * gripBlend;
  player.velocity[1] += (targetZ - player.velocity[1]) * gripBlend;
  const drag = Math.exp(-(player.input.throttle > 0 ? 0.12 : 0.8) * dt);
  player.velocity[0] *= drag;
  player.velocity[1] *= drag;
  player.position[0] += player.velocity[0] * dt;
  player.position[1] += player.velocity[1] * dt;
}

function containPlayer(state: DrivingState, player: DrivingPlayerState) {
  const limit = state.worldRadius - state.carRadius;
  let collided = false;
  for (let axis = 0; axis < 2; axis++) {
    if (Math.abs(player.position[axis]) <= limit) continue;
    player.position[axis] = clamp(player.position[axis], -limit, limit);
    player.velocity[axis] *= -0.25;
    collided = true;
  }
  return collided;
}

function resolvePlayerCollisions(state: DrivingState, events: DrivingEvent[]) {
  const players = [...state.players.entries()];
  const minimumDistance = state.carRadius * 2;
  for (let leftIndex = 0; leftIndex < players.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < players.length; rightIndex++) {
      const [leftId, left] = players[leftIndex];
      const [rightId, right] = players[rightIndex];
      const dx = right.position[0] - left.position[0];
      const dz = right.position[1] - left.position[1];
      const distance = Math.hypot(dx, dz);
      if (distance >= minimumDistance) continue;
      const nx = distance > 1e-6 ? dx / distance : 1;
      const nz = distance > 1e-6 ? dz / distance : 0;
      const correction = (minimumDistance - distance) / 2;
      left.position[0] -= nx * correction;
      left.position[1] -= nz * correction;
      right.position[0] += nx * correction;
      right.position[1] += nz * correction;
      const closing = (left.velocity[0] - right.velocity[0]) * nx
        + (left.velocity[1] - right.velocity[1]) * nz;
      if (closing <= 0) continue;
      const impulse = closing * 0.55;
      left.velocity[0] -= nx * impulse;
      left.velocity[1] -= nz * impulse;
      right.velocity[0] += nx * impulse;
      right.velocity[1] += nz * impulse;
      events.push({ type: "collision", playerId: leftId, otherPlayerId: rightId });
    }
  }
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function approach(value: number, target: number, amount: number) {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
}

function normalizeAngle(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}
