import * as THREE from "three";
import type { CarAudioOptions } from "../audio/car-audio";
import type { DrivingWorldQuery } from "../core/world-query";
import type { DrivingProfile } from "../driving-profiles";
import { createDrivingVehicleSimulation } from "../simulation/vehicle-simulation";
import type { ControlMode, DriveEndReason } from "../types";
import { createDrivingWorldQuery } from "../world/driving-world-query";
import type { WorldRuntime } from "../world/types";
import {
  createNullPlayerPresentation,
  createPlayerPresentation,
  type PlayerPresentation,
} from "./player-presentation";
import type {
  PlayerController,
  PlayerEvent,
  PlayerExternalCollision,
  PlayerSnapshot,
} from "./types";

export function createPlayerController({
  scene,
  audioOptions,
  presentation: suppliedPresentation,
  world: initialWorld,
  worldQuery: suppliedWorldQuery,
  profile,
  controlMode,
  onEvent,
  onResetRequested,
}: {
  scene?: THREE.Scene;
  audioOptions?: CarAudioOptions;
  presentation?: PlayerPresentation;
  world?: WorldRuntime;
  worldQuery?: DrivingWorldQuery;
  profile: DrivingProfile;
  controlMode: ControlMode;
  onEvent: (event: PlayerEvent) => void;
  onResetRequested: (reason: DriveEndReason) => void;
}): PlayerController {
  if (!initialWorld && !suppliedWorldQuery) {
    throw new Error("PlayerController requires a world or DrivingWorldQuery.");
  }
  const presentation = suppliedPresentation
    ?? (scene ? createPlayerPresentation(scene, profile, audioOptions) : createNullPlayerPresentation());
  const worldQuery = suppliedWorldQuery ?? createDrivingWorldQuery(initialWorld as WorldRuntime);
  const presentationPosition = new THREE.Vector3();
  const snapshot: PlayerSnapshot = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    heading: 0,
    speed: 0,
    visualSlip: 0,
    driftPhase: "grip",
    boosting: false,
    cameraShake: 0,
    exitPulse: 0,
  };
  const simulation = createDrivingVehicleSimulation({
    world: worldQuery,
    profile,
    controlMode,
    onEvent(event) {
      if (
        event.type === "collision"
        && (
          event.terminal
          || event.strength > (event.obstacleType === "vehicle" ? 2 / 14 : 3 / 14)
        )
      ) presentation.impact(event.strength);
      onEvent(event);
    },
    onResetRequested,
  });

  function syncPresentation(reset: boolean) {
    const state = simulation.snapshot();
    presentationPosition.set(state.position.x, 0.06, state.position.z);
    if (reset) presentation.reset(presentationPosition, state.heading);
    else presentation.syncPosition(presentationPosition);
  }

  function reset() {
    simulation.reset();
    syncPresentation(true);
  }

  reset();
  return {
    start: presentation.start,
    update(dt) {
      presentation.update(simulation.update(dt));
    },
    setWorld(world) {
      simulation.setWorld(createDrivingWorldQuery(world));
    },
    setControlMode: simulation.setControlMode,
    setDrivingProfile(nextProfile) {
      simulation.setDrivingProfile(nextProfile);
      presentation.setProfile(nextProfile);
    },
    setControl: simulation.setControl,
    clearControls: simulation.clearControls,
    applyExternalCollision(collision: PlayerExternalCollision) {
      simulation.applyExternalCollision(collision);
      syncPresentation(false);
    },
    reset,
    placeAt(x, z, heading) {
      simulation.placeAt(x, z, heading);
      syncPresentation(true);
    },
    setPaused: presentation.setPaused,
    getSnapshot() {
      const state = simulation.snapshot();
      snapshot.position.set(state.position.x, 0.06, state.position.z);
      snapshot.velocity.set(state.velocity.x, 0, state.velocity.z);
      snapshot.heading = state.heading;
      snapshot.speed = state.speed;
      snapshot.visualSlip = state.visualSlip;
      snapshot.driftPhase = state.driftPhase;
      snapshot.boosting = state.boosting;
      snapshot.cameraShake = state.cameraShake;
      snapshot.exitPulse = state.exitPulse;
      return snapshot;
    },
    decayCameraShake: simulation.decayCameraShake,
    destroy: presentation.destroy,
  };
}
