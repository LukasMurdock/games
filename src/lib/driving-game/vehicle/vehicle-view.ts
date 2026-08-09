import * as THREE from "three";
import type { AuthoritativeDrivingPlayer } from "../multiplayer/simulation";
import type { DrivingVehicleFrame } from "../simulation/types";
import { createCar } from "./create-car";

export type VehicleView = {
  reset(position: { x: number; z: number }, heading: number): void;
  syncPosition(position: { x: number; z: number }): void;
  update(frame: DrivingVehicleFrame): void;
  applyAuthoritativeSnapshot(snapshot: AuthoritativeDrivingPlayer, dt: number): void;
  destroy(): void;
};

/** Render-only car ownership shared by local and future remote presentations. */
export function createVehicleView(scene: THREE.Scene): VehicleView {
  const car = createCar();
  let steeringVisual = 0;
  scene.add(car.group);

  function setPosition(position: { x: number; z: number }) {
    car.group.position.set(position.x, 0.06, position.z);
  }

  function animate(options: {
    dt: number;
    position: { x: number; z: number };
    heading: number;
    steering: number;
    forwardSpeed: number;
    targetRoll: number;
    targetPitch: number;
    braking: boolean;
  }) {
    steeringVisual = THREE.MathUtils.lerp(
      steeringVisual,
      options.steering * 0.48,
      1 - Math.exp(-12 * options.dt),
    );
    setPosition(options.position);
    car.group.rotation.y = options.heading;
    car.group.rotation.z = THREE.MathUtils.lerp(
      car.group.rotation.z,
      options.targetRoll,
      1 - Math.exp(-7 * options.dt),
    );
    car.group.rotation.x = THREE.MathUtils.lerp(
      car.group.rotation.x,
      options.targetPitch,
      1 - Math.exp(-9 * options.dt),
    );
    car.frontWheels.forEach((wheel) => (wheel.rotation.y = steeringVisual));
    const wheelSpin = options.forwardSpeed * options.dt / 0.42;
    car.wheels.forEach((wheel) => (wheel.rotation.x += wheelSpin));
    car.brakeLights.forEach((light) => {
      const material = light.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = options.braking ? 5 : 1.2;
    });
  }

  return {
    reset(position, heading) {
      steeringVisual = 0;
      setPosition(position);
      car.group.rotation.set(0, heading, 0);
    },
    syncPosition: setPosition,
    update(frame) {
      animate({
        dt: frame.dt,
        position: frame.position,
        heading: frame.heading,
        steering: frame.steering,
        forwardSpeed: frame.forwardSpeed,
        targetRoll: frame.targetRoll,
        targetPitch: frame.targetPitch,
        braking: frame.braking || frame.handbrake || frame.hardDriftKick > 0.05,
      });
    },
    applyAuthoritativeSnapshot(snapshot, dt) {
      const forwardX = Math.sin(snapshot.heading);
      const forwardZ = Math.cos(snapshot.heading);
      const forwardSpeed = snapshot.velocity[0] * forwardX + snapshot.velocity[1] * forwardZ;
      animate({
        dt,
        position: { x: snapshot.position[0], z: snapshot.position[1] },
        heading: snapshot.heading,
        steering: 0,
        forwardSpeed,
        targetRoll: THREE.MathUtils.clamp(snapshot.visualSlip * 0.12, -0.075, 0.075),
        targetPitch: -snapshot.exitPulse * 0.025,
        braking: false,
      });
    },
    destroy() {
      scene.remove(car.group);
      car.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
    },
  };
}
