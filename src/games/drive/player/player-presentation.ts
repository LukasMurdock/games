import * as THREE from "three";
import { createCarAudio, type CarAudio, type CarAudioOptions } from "../audio/car-audio";
import type { DrivingProfile } from "../driving-profiles";
import type { DrivingVehicleFrame } from "../simulation/types";
import { createDriftSmoke, createSkidMarks } from "../vehicle/effects";
import { createVehicleView } from "../vehicle/vehicle-view";

export type PlayerPresentation = {
  start(): void;
  reset(position: THREE.Vector3, heading: number): void;
  syncPosition(position: THREE.Vector3): void;
  update(frame: DrivingVehicleFrame): void;
  impact(strength: number): void;
  setProfile(profile: DrivingProfile): void;
  setPaused(paused: boolean): void;
  /** Supplies drivable surface height (ramps) for visual elevation and airtime. */
  setSurface(surfaceHeightAt: (x: number, z: number) => number): void;
  destroy(): void;
};

/** Arcade gravity for presentation-only airtime; stronger than real so hops stay snappy. */
const AIR_GRAVITY = 24;

export function createNullPlayerPresentation(): PlayerPresentation {
  return {
    start() {},
    reset() {},
    syncPosition() {},
    update() {},
    impact() {},
    setProfile() {},
    setPaused() {},
    setSurface() {},
    destroy() {},
  };
}

export function createPlayerPresentation(
  scene: THREE.Scene,
  initialProfile: DrivingProfile,
  audioOptions: CarAudioOptions = {},
): PlayerPresentation {
  let profile = initialProfile;
  let audio: CarAudio | null = null;
  let audioPaused = false;
  const vehicleView = createVehicleView(scene);
  const framePosition = new THREE.Vector3();
  const driftSmoke = createDriftSmoke(scene);
  const skidMarks = createSkidMarks(scene);
  let surfaceHeightAt: (x: number, z: number) => number = () => 0;
  // Visual elevation state: the simulation is flat, so ramps and airtime live here.
  let elevation = 0;
  let verticalSpeed = 0;
  let airborne = false;

  function updateElevation(frame: DrivingVehicleFrame) {
    const dt = frame.dt;
    if (dt <= 0) return;
    const ground = surfaceHeightAt(frame.position.x, frame.position.z);
    if (airborne) {
      verticalSpeed -= AIR_GRAVITY * dt;
      elevation += verticalSpeed * dt;
      if (elevation <= ground) {
        const impactSpeed = -verticalSpeed;
        elevation = ground;
        verticalSpeed = 0;
        airborne = false;
        if (impactSpeed > 3) audio?.impact(Math.min(1, impactSpeed / 14) * 0.7);
      }
      return;
    }
    // Leave the surface when it falls away faster than a ballistic arc would.
    const predicted = elevation + verticalSpeed * dt - 0.5 * AIR_GRAVITY * dt * dt;
    if (predicted > ground + 0.04) {
      airborne = true;
      verticalSpeed -= AIR_GRAVITY * dt;
      elevation = predicted;
      return;
    }
    verticalSpeed = (ground - elevation) / dt;
    elevation = ground;
  }

  return {
    start() {
      audio ??= createCarAudio(profile, audioOptions);
    },
    reset(position: THREE.Vector3, heading: number) {
      elevation = 0;
      verticalSpeed = 0;
      airborne = false;
      driftSmoke.reset();
      skidMarks.reset();
      audio?.reset();
      vehicleView.reset(position, heading);
    },
    syncPosition(position: THREE.Vector3) {
      vehicleView.syncPosition(position);
    },
    update(frame: DrivingVehicleFrame) {
      updateElevation(frame);
      framePosition.set(frame.position.x, 0.06, frame.position.z);
      // Nose follows the vertical path: up the ramp face, then over the arc in the air.
      const trajectoryPitch = -Math.atan2(verticalSpeed, Math.max(6, Math.abs(frame.forwardSpeed))) * 0.85;
      vehicleView.update(frame, { elevation, pitch: elevation > 0.02 || airborne ? trajectoryPitch : 0 });
      // Tyres only mark and smoke while they touch the ground.
      const grounded = elevation < 0.08;
      driftSmoke.update(
        frame.dt,
        framePosition,
        frame.heading,
        grounded ? frame.slipIntensity : 0,
        frame.speed,
      );
      skidMarks.update(framePosition, frame.heading, grounded ? frame.slipIntensity : 0, frame.distance);
      audio?.update({
        dt: frame.dt,
        speed: frame.speed,
        forwardSpeed: frame.forwardSpeed,
        signedSlipDegrees: THREE.MathUtils.radToDeg(frame.visualSlip),
        steeringLoad: Math.abs(frame.steering) * THREE.MathUtils.clamp(frame.speed / 14, 0, 1),
        steerDirection: frame.steering,
        phase: frame.driftPhase,
        onPavement: frame.onPavement,
        boosting: frame.boosting,
        throttle: frame.throttle,
        braking: frame.braking,
        reversing: frame.reversing,
      });
    },
    impact(strength: number) {
      audio?.impact(strength);
    },
    setProfile(nextProfile: DrivingProfile) {
      const audioWasStarted = audio !== null;
      audio?.destroy();
      audio = null;
      profile = nextProfile;
      if (audioWasStarted) {
        const nextAudio = createCarAudio(profile, audioOptions);
        nextAudio?.setPaused(audioPaused);
        audio = nextAudio;
      }
    },
    setPaused(paused: boolean) {
      audioPaused = paused;
      audio?.setPaused(paused);
    },
    setSurface(query) {
      surfaceHeightAt = query;
    },
    destroy() {
      audio?.destroy();
      driftSmoke.destroy();
      skidMarks.destroy();
      vehicleView.destroy();
    },
  };
}
