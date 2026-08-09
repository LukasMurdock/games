import type { GameSimulation } from "../../net/runtime/simulation";

export type MovingCirclesConfig = {
  speed?: number;
  worldRadius?: number;
  spawnSpacing?: number;
};

export type MovingCirclesInput = {
  direction: [number, number];
};

export type MovingCircle = {
  playerId: string;
  position: [number, number];
};

export type MovingCirclesSnapshot = {
  players: MovingCircle[];
};

export type MovingCirclesEvent =
  | { type: "joined"; playerId: string }
  | { type: "left"; playerId: string };

type CirclePlayerState = {
  position: [number, number];
  direction: [number, number];
};

export type MovingCirclesState = {
  players: Map<string, CirclePlayerState>;
  speed: number;
  worldRadius: number;
  spawnSpacing: number;
  nextSpawn: number;
};

export const movingCirclesSimulation: GameSimulation<
  MovingCirclesConfig,
  MovingCirclesInput,
  MovingCirclesState,
  MovingCirclesSnapshot,
  MovingCirclesEvent
> = {
  create(config) {
    return {
      players: new Map(),
      speed: config.speed ?? 10,
      worldRadius: config.worldRadius ?? 100,
      spawnSpacing: config.spawnSpacing ?? 4,
      nextSpawn: 0,
    };
  },

  addPlayer(state, playerId) {
    if (state.players.has(playerId)) throw new Error(`Player already exists: ${playerId}.`);
    const column = state.nextSpawn % 4;
    const row = Math.floor(state.nextSpawn / 4);
    state.nextSpawn += 1;
    state.players.set(playerId, {
      position: [column * state.spawnSpacing, row * state.spawnSpacing],
      direction: [0, 0],
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
    player.direction = normalizedDirection(input.direction);
  },

  tick(state, dt) {
    for (const player of state.players.values()) {
      player.position[0] = wrap(
        player.position[0] + player.direction[0] * state.speed * dt,
        state.worldRadius,
      );
      player.position[1] = wrap(
        player.position[1] + player.direction[1] * state.speed * dt,
        state.worldRadius,
      );
    }
  },

  snapshot(state) {
    return {
      players: [...state.players.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([playerId, player]) => ({
          playerId,
          position: [...player.position] as [number, number],
        })),
    };
  },
};

function normalizedDirection(direction: [number, number]): [number, number] {
  const x = Number.isFinite(direction[0]) ? direction[0] : 0;
  const y = Number.isFinite(direction[1]) ? direction[1] : 0;
  const length = Math.hypot(x, y);
  if (length <= 1) return [x, y];
  return [x / length, y / length];
}

function wrap(value: number, radius: number) {
  const size = radius * 2;
  return ((value + radius) % size + size) % size - radius;
}
