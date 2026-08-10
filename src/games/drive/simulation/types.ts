import type { DrivingControlName } from "../core/controls";
import type { DrivingProfile } from "../driving-profiles";
import type { ControlMode, DriftPhase, DriveEndReason } from "../types";
import type { ObstacleKind } from "../world/types";
import type { DrivingWorldQuery } from "../core/world-query";

export type DrivingSimulationEvent =
  | {
      type: "collision";
      obstacleType: ObstacleKind | "boundary" | "vehicle";
      terminal: boolean;
      strength: number;
    }
  | { type: "drift-phase"; phase: DriftPhase };

export type DrivingExternalCollision = {
  normalX: number;
  normalZ: number;
  penetration: number;
  closingSpeed: number;
};

export type DrivingVehicleSnapshot = {
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  heading: number;
  speed: number;
  visualSlip: number;
  driftPhase: DriftPhase;
  boosting: boolean;
  cameraShake: number;
  exitPulse: number;
};

export type DrivingVehicleFrame = DrivingVehicleSnapshot & {
  dt: number;
  steering: number;
  forwardSpeed: number;
  braking: boolean;
  handbrake: boolean;
  hardDriftKick: number;
  slipIntensity: number;
  distance: number;
  targetRoll: number;
  targetPitch: number;
  onPavement: boolean;
  throttle: number;
  reversing: boolean;
};

export type DrivingVehicleSimulation = {
  update(dt: number): DrivingVehicleFrame;
  setControl(name: DrivingControlName, pressed: boolean): void;
  clearControls(): void;
  setWorld(world: DrivingWorldQuery): void;
  setControlMode(mode: ControlMode): void;
  setDrivingProfile(profile: DrivingProfile): void;
  applyExternalCollision(collision: DrivingExternalCollision): void;
  reset(): void;
  placeAt(x: number, z: number, heading: number): void;
  snapshot(): DrivingVehicleSnapshot;
  decayCameraShake(dt: number): void;
};

export type DrivingVehicleSimulationOptions = {
  world: DrivingWorldQuery;
  profile: DrivingProfile;
  controlMode: ControlMode;
  onEvent?: (event: DrivingSimulationEvent) => void;
  onResetRequested?: (reason: DriveEndReason) => void;
};
