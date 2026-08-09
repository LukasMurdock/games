import type * as THREE from "three";
import type { DrivingControlName } from "../core/controls";
import type { DrivingProfile } from "../driving-profiles";
import type {
  DrivingExternalCollision,
  DrivingSimulationEvent,
} from "../simulation/types";
import type { ControlMode, DriftPhase } from "../types";
import type { WorldRuntime } from "../world/types";

export type PlayerControlName = DrivingControlName;

export type PlayerExternalCollision = DrivingExternalCollision;

export type PlayerSnapshot = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  heading: number;
  speed: number;
  visualSlip: number;
  driftPhase: DriftPhase;
  boosting: boolean;
  cameraShake: number;
  exitPulse: number;
};

export type PlayerEvent = DrivingSimulationEvent;

export type PlayerController = {
  start: () => void;
  update: (dt: number) => void;
  setWorld: (world: WorldRuntime) => void;
  setControlMode: (mode: ControlMode) => void;
  setDrivingProfile: (profile: DrivingProfile) => void;
  setControl: (name: PlayerControlName, pressed: boolean) => void;
  clearControls: () => void;
  applyExternalCollision: (collision: PlayerExternalCollision) => void;
  reset: () => void;
  placeAt: (x: number, z: number, heading: number) => void;
  setPaused: (paused: boolean) => void;
  getSnapshot: () => PlayerSnapshot;
  decayCameraShake: (dt: number) => void;
  destroy: () => void;
};
