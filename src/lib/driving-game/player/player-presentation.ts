import * as THREE from "three";
import { createCarAudio, type CarAudio } from "../audio/car-audio";
import type { DrivingProfile } from "../driving-profiles";
import type { DrivingVehicleFrame } from "../simulation/types";
import { createCar } from "../vehicle/create-car";
import { createDriftSmoke, createSkidMarks } from "../vehicle/effects";

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
): PlayerPresentation {
  let profile = initialProfile;
  let audio: CarAudio | null = null;
  let audioPaused = false;
  let steeringVisual = 0;
  const car = createCar();
  const framePosition = new THREE.Vector3();
  scene.add(car.group);
  const driftSmoke = createDriftSmoke(scene);
  const skidMarks = createSkidMarks(scene);

  return {
    start() {
      audio ??= createCarAudio(profile);
    },
    reset(position: THREE.Vector3, heading: number) {
      steeringVisual = 0;
      driftSmoke.reset();
      skidMarks.reset();
      audio?.reset();
      car.group.position.copy(position);
      car.group.rotation.set(0, heading, 0);
    },
    syncPosition(position: THREE.Vector3) {
      car.group.position.copy(position);
    },
    update(frame: DrivingVehicleFrame) {
      framePosition.set(frame.position.x, 0.06, frame.position.z);
      steeringVisual = THREE.MathUtils.lerp(
        steeringVisual,
        frame.steering * 0.48,
        1 - Math.exp(-12 * frame.dt),
      );
      car.group.position.copy(framePosition);
      car.group.rotation.y = frame.heading;
      car.group.rotation.z = THREE.MathUtils.lerp(
        car.group.rotation.z,
        frame.targetRoll,
        1 - Math.exp(-7 * frame.dt),
      );
      car.group.rotation.x = THREE.MathUtils.lerp(
        car.group.rotation.x,
        frame.targetPitch,
        1 - Math.exp(-9 * frame.dt),
      );
      car.frontWheels.forEach((wheel) => (wheel.rotation.y = steeringVisual));
      const wheelSpin = frame.forwardSpeed * frame.dt / 0.42;
      car.wheels.forEach((wheel) => (wheel.rotation.x += wheelSpin));
      car.brakeLights.forEach((light) => {
        const material = light.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = frame.braking || frame.handbrake || frame.hardDriftKick > 0.05 ? 5 : 1.2;
      });
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
        const nextAudio = createCarAudio(profile);
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
    },
  };
}
