import type { DrivingControlName } from "../core/controls";
import type { DrivingWorldQuery } from "../core/world-query";
import type { DrivingProfile } from "../driving-profiles";
import { createPlayerController } from "../player/player-controller";
import type { PlayerEvent, PlayerExternalCollision } from "../player/types";
import type { ControlMode, DriftPhase, DriveEndReason } from "../types";

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

export type DrivingVehicleSimulation = {
  update(dt: number): void;
  setControl(name: DrivingControlName, pressed: boolean): void;
  clearControls(): void;
  setControlMode(mode: ControlMode): void;
  setDrivingProfile(profile: DrivingProfile): void;
  applyExternalCollision(collision: PlayerExternalCollision): void;
  reset(): void;
  placeAt(x: number, z: number, heading: number): void;
  snapshot(): DrivingVehicleSnapshot;
};

/**
 * Presentation-free entry point for the production vehicle mechanics. Local
 * play composes the same mechanics with a Three.js presentation; an
 * authoritative session can create one of these per admitted player.
 */
export function createDrivingVehicleSimulation(options: {
  world: DrivingWorldQuery;
  profile: DrivingProfile;
  controlMode: ControlMode;
  onEvent?: (event: PlayerEvent) => void;
  onResetRequested?: (reason: DriveEndReason) => void;
}): DrivingVehicleSimulation {
  const vehicle = createPlayerController({
    worldQuery: options.world,
    profile: options.profile,
    controlMode: options.controlMode,
    onEvent: options.onEvent ?? (() => undefined),
    onResetRequested: options.onResetRequested ?? (() => undefined),
  });

  return {
    update: vehicle.update,
    setControl: vehicle.setControl,
    clearControls: vehicle.clearControls,
    setControlMode: vehicle.setControlMode,
    setDrivingProfile: vehicle.setDrivingProfile,
    applyExternalCollision: vehicle.applyExternalCollision,
    reset: vehicle.reset,
    placeAt: vehicle.placeAt,
    snapshot() {
      const snapshot = vehicle.getSnapshot();
      return {
        position: { x: snapshot.position.x, z: snapshot.position.z },
        velocity: { x: snapshot.velocity.x, z: snapshot.velocity.z },
        heading: snapshot.heading,
        speed: snapshot.speed,
        visualSlip: snapshot.visualSlip,
        driftPhase: snapshot.driftPhase,
        boosting: snapshot.boosting,
        cameraShake: snapshot.cameraShake,
        exitPulse: snapshot.exitPulse,
      };
    },
  };
}
