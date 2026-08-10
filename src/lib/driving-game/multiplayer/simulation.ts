import type { DrivingWorldQuery } from "../core/world-query";
import type { DrivingProfile } from "../driving-profiles";
import {
  createDrivingVehicleSimulation,
  type DrivingSimulationEvent,
  type DrivingVehicleSimulation,
  type DrivingVehicleSnapshot,
} from "../simulation/vehicle-simulation";
import type { ControlMode, DriftPhase } from "../types";
import type { GameSimulation } from "../../../net/runtime/simulation";

export type AuthoritativeDrivingConfig = {
  world: DrivingWorldQuery;
  profile: DrivingProfile;
  controlMode: ControlMode;
  spawns: readonly { x: number; z: number; heading: number }[];
  carRadius?: number;
  mapId?: string;
  modeId?: string;
  profileId?: string;
};

export type AuthoritativeDrivingInput = {
  steering: -1 | 0 | 1;
  throttle: number;
  brake: boolean;
  handbrake: boolean;
  readyEpoch?: number;
};

export type AuthoritativeDrivingPlayer = {
  playerId: string;
  position: [number, number];
  velocity: [number, number];
  heading: number;
  speed: number;
  visualSlip: number;
  driftPhase: DriftPhase;
  boosting: boolean;
  exitPulse: number;
  steering?: number;
};

export type AuthoritativeDrivingSnapshot = {
  players: AuthoritativeDrivingPlayer[];
  configurationEpoch?: number;
  paused?: boolean;
  mapId?: string;
  modeId?: string;
  profileId?: string;
  controlMode?: ControlMode;
};

export type AuthoritativeDrivingEvent =
  | { type: "joined"; playerId: string }
  | { type: "left"; playerId: string }
  | {
      type: "collision";
      playerId: string;
      otherPlayerId?: string;
      terminal: boolean;
    }
  | {
      type: "configuration";
      configurationEpoch: number;
      mapId: string;
      modeId: string;
      profileId: string;
      controlMode: ControlMode;
    };

type PlayerRecord = {
  vehicle: DrivingVehicleSimulation;
  spawnIndex: number;
  steering: number;
};

export type AuthoritativeDrivingState = {
  config: AuthoritativeDrivingConfig;
  players: Map<string, PlayerRecord>;
  pendingEvents: AuthoritativeDrivingEvent[];
  availableSpawns: number[];
  carRadius: number;
  configurationEpoch: number;
  paused: boolean;
  readyPlayers: Set<string>;
  awaitingReadiness: boolean;
};

export const authoritativeDrivingSimulation: GameSimulation<
  AuthoritativeDrivingConfig,
  AuthoritativeDrivingInput,
  AuthoritativeDrivingState,
  AuthoritativeDrivingSnapshot,
  AuthoritativeDrivingEvent
> = {
  create(config) {
    if (config.spawns.length < 1 || config.spawns.length > 8) {
      throw new Error("Authoritative driving requires between one and eight spawn points.");
    }
    for (const spawn of config.spawns) {
      if (![spawn.x, spawn.z, spawn.heading].every(Number.isFinite)) {
        throw new Error("Authoritative driving spawn points must be finite.");
      }
    }
    const carRadius = config.carRadius ?? 1.25;
    for (let left = 0; left < config.spawns.length; left++) {
      for (let right = left + 1; right < config.spawns.length; right++) {
        const first = config.spawns[left];
        const second = config.spawns[right];
        if (Math.hypot(first.x - second.x, first.z - second.z) < carRadius * 2) {
          throw new Error("Authoritative driving spawn points must not overlap.");
        }
      }
    }
    return {
      config,
      players: new Map(),
      pendingEvents: [],
      availableSpawns: config.spawns.map((_, index) => index),
      carRadius,
      configurationEpoch: 0,
      paused: false,
      readyPlayers: new Set(),
      awaitingReadiness: false,
    };
  },

  addPlayer(state, playerId) {
    if (state.players.has(playerId)) throw new Error(`Player already exists: ${playerId}.`);
    const spawnIndex = state.availableSpawns.shift();
    if (spawnIndex === undefined) throw new Error("No authoritative driving spawn remains.");
    const spawn = state.config.spawns[spawnIndex];
    const playerWorld: DrivingWorldQuery = { ...state.config.world, spawn };
    let vehicle: DrivingVehicleSimulation;
    vehicle = createDrivingVehicleSimulation({
      world: playerWorld,
      profile: state.config.profile,
      controlMode: state.config.controlMode,
      onEvent: (event) => enqueueVehicleEvent(state, playerId, event),
      onResetRequested: () => vehicle.reset(),
    });
    state.players.set(playerId, { vehicle, spawnIndex, steering: 0 });
    return [{ type: "joined", playerId }];
  },

  removePlayer(state, playerId) {
    const record = state.players.get(playerId);
    if (!record) return;
    state.players.delete(playerId);
    state.readyPlayers.delete(playerId);
    insertSorted(state.availableSpawns, record.spawnIndex);
    return [{ type: "left", playerId }];
  },

  input(state, playerId, input) {
    const record = state.players.get(playerId);
    if (!record) return;
    if (input.readyEpoch === state.configurationEpoch) state.readyPlayers.add(playerId);
    const steering = input.steering === -1 || input.steering === 1 ? input.steering : 0;
    // Network intent uses -1 for left; vehicle presentation uses +1 for left.
    record.steering = -steering;
    record.vehicle.setControl("left", steering === -1);
    record.vehicle.setControl("right", steering === 1);
    record.vehicle.setControl("accelerate", clamp(finite(input.throttle), 0, 1) > 0.1);
    record.vehicle.setControl("brake", input.brake === true);
    record.vehicle.setControl("handbrake", input.handbrake === true);
  },

  tick(state, dt) {
    if (state.paused) return;
    for (const record of state.players.values()) record.vehicle.update(dt);
    resolveVehicleCollisions(state);
    return state.pendingEvents.splice(0);
  },

  snapshot(state) {
    return {
      players: [...state.players.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([playerId, record]) => ({
          ...playerSnapshot(playerId, record.vehicle.snapshot()),
          steering: record.steering,
        })),
      configurationEpoch: state.configurationEpoch,
      paused: state.paused,
      mapId: state.config.mapId,
      modeId: state.config.modeId,
      profileId: state.config.profileId,
      controlMode: state.config.controlMode,
    };
  },
};

export function setAuthoritativeDrivingPaused(
  state: AuthoritativeDrivingState,
  paused: boolean,
) {
  if (!paused && state.awaitingReadiness && !areAuthoritativeDrivingPlayersReady(state)) {
    throw new Error("All connected players must load the configuration before resume.");
  }
  state.paused = paused;
  if (!paused) state.awaitingReadiness = false;
}

export function reconfigureAuthoritativeDriving(
  state: AuthoritativeDrivingState,
  config: AuthoritativeDrivingConfig,
) {
  if (!config.mapId || !config.modeId || !config.profileId) {
    throw new Error("A reconfiguration requires map, mode, and profile IDs.");
  }
  const validated = authoritativeDrivingSimulation.create(config);
  if (config.spawns.length < state.players.size) {
    throw new Error("The new configuration does not have enough spawn points.");
  }
  state.config = config;
  state.carRadius = validated.carRadius;
  state.configurationEpoch += 1;
  state.paused = true;
  state.awaitingReadiness = true;
  state.readyPlayers.clear();
  const usedSpawns = new Set<number>();
  for (const record of state.players.values()) {
    usedSpawns.add(record.spawnIndex);
    const spawn = config.spawns[record.spawnIndex];
    record.vehicle.setWorld({ ...config.world, spawn });
    record.vehicle.setDrivingProfile(config.profile);
    record.vehicle.setControlMode(config.controlMode);
    record.vehicle.reset();
    record.steering = 0;
  }
  state.availableSpawns = config.spawns
    .map((_, index) => index)
    .filter((index) => !usedSpawns.has(index));
  return {
    type: "configuration" as const,
    configurationEpoch: state.configurationEpoch,
    mapId: config.mapId,
    modeId: config.modeId,
    profileId: config.profileId,
    controlMode: config.controlMode,
  };
}

export function areAuthoritativeDrivingPlayersReady(state: AuthoritativeDrivingState) {
  return [...state.players.keys()].every((playerId) => state.readyPlayers.has(playerId));
}

function resolveVehicleCollisions(state: AuthoritativeDrivingState) {
  const players = [...state.players.entries()];
  const minimumDistance = state.carRadius * 2;
  for (let leftIndex = 0; leftIndex < players.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < players.length; rightIndex++) {
      const [leftId, leftRecord] = players[leftIndex];
      const [rightId, rightRecord] = players[rightIndex];
      const left = leftRecord.vehicle.snapshot();
      const right = rightRecord.vehicle.snapshot();
      const dx = right.position.x - left.position.x;
      const dz = right.position.z - left.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= minimumDistance) continue;
      const normalX = distance > 1e-6 ? dx / distance : 1;
      const normalZ = distance > 1e-6 ? dz / distance : 0;
      const closingSpeed = Math.max(0,
        (left.velocity.x - right.velocity.x) * normalX
        + (left.velocity.z - right.velocity.z) * normalZ,
      );
      const penetration = (minimumDistance - distance) / 2;
      leftRecord.vehicle.applyExternalCollision({
        normalX: -normalX,
        normalZ: -normalZ,
        penetration,
        closingSpeed,
      });
      rightRecord.vehicle.applyExternalCollision({
        normalX,
        normalZ,
        penetration,
        closingSpeed,
      });
      state.pendingEvents.push({
        type: "collision",
        playerId: leftId,
        otherPlayerId: rightId,
        terminal: false,
      });
    }
  }
}

function enqueueVehicleEvent(
  state: AuthoritativeDrivingState,
  playerId: string,
  event: DrivingSimulationEvent,
) {
  if (event.type !== "collision" || event.obstacleType === "vehicle") return;
  state.pendingEvents.push({
    type: "collision",
    playerId,
    terminal: event.terminal,
  });
}

function playerSnapshot(
  playerId: string,
  snapshot: DrivingVehicleSnapshot,
): AuthoritativeDrivingPlayer {
  return {
    playerId,
    position: [snapshot.position.x, snapshot.position.z],
    velocity: [snapshot.velocity.x, snapshot.velocity.z],
    heading: snapshot.heading,
    speed: snapshot.speed,
    visualSlip: snapshot.visualSlip,
    driftPhase: snapshot.driftPhase,
    boosting: snapshot.boosting,
    exitPulse: snapshot.exitPulse,
  };
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}
function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
function insertSorted(values: number[], value: number) {
  const index = values.findIndex((candidate) => candidate > value);
  if (index < 0) values.push(value);
  else values.splice(index, 0, value);
}
