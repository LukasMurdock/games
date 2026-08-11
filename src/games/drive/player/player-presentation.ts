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
  destroy(): void;
};

export function createNullPlayerPresentation(): PlayerPresentation {
  return {
    start() {},
    reset() {},
    syncPosition() {},
    update() {},
    impact() {},
    setProfile() {},
    setPaused() {},
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

  return {
    start() {
      audio ??= createCarAudio(profile, audioOptions);
    },
    reset(position: THREE.Vector3, heading: number) {
      driftSmoke.reset();
      skidMarks.reset();
      audio?.reset();
      vehicleView.reset(position, heading);
    },
    syncPosition(position: THREE.Vector3) {
      vehicleView.syncPosition(position);
    },
    update(frame: DrivingVehicleFrame) {
      framePosition.set(frame.position.x, 0.06, frame.position.z);
      vehicleView.update(frame);
      driftSmoke.update(
        frame.dt,
        framePosition,
        frame.heading,
        frame.slipIntensity,
        frame.speed,
      );
      skidMarks.update(framePosition, frame.heading, frame.slipIntensity, frame.distance);
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
    destroy() {
      audio?.destroy();
      driftSmoke.destroy();
      skidMarks.destroy();
      vehicleView.destroy();
    },
  };
}
