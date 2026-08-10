import * as THREE from "three";
import { createCar } from "../vehicle/create-car";
import type { AuthoritativeDrivingSnapshot } from "./simulation";

export type AuthoritativePursuerFleet = {
  readonly size: number;
  update(snapshot: AuthoritativeDrivingSnapshot, dt: number): void;
  destroy(): void;
};

type PoliceCar = ReturnType<typeof createCar>;

/** Render-only police fleet driven exclusively by host snapshots. */
export function createAuthoritativePursuerFleet(scene: THREE.Scene): AuthoritativePursuerFleet {
  const cars = new Map<string, PoliceCar>();
  let sirenTime = 0;

  function destroyCar(car: PoliceCar) {
    scene.remove(car.group);
    car.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
  }

  return {
    get size() { return cars.size; },
    update(snapshot, dt) {
      const active = new Set<string>();
      const paused = snapshot.paused === true || snapshot.chase?.state === "captured";
      if (!paused) sirenTime += dt;
      for (const pursuer of snapshot.pursuers ?? []) {
        active.add(pursuer.pursuerId);
        let car = cars.get(pursuer.pursuerId);
        if (!car) {
          car = createCar({ police: true });
          scene.add(car.group);
          cars.set(pursuer.pursuerId, car);
        }
        car.group.visible = snapshot.modeId === "chase";
        car.group.position.set(pursuer.position[0], 0.06, pursuer.position[1]);
        car.group.rotation.y = pursuer.heading;
        car.frontWheels.forEach((wheel) => { wheel.rotation.y = pursuer.steering; });
        if (!paused) car.wheels.forEach((wheel) => { wheel.rotation.x += pursuer.speed * dt / 0.42; });
        car.emergencyLights.forEach((light, index) => {
          const material = light.material as THREE.MeshStandardMaterial;
          material.emissiveIntensity = Math.sin(sirenTime * 16 + index * Math.PI) > 0 ? 7 : 0.65;
        });
      }
      for (const [id, car] of cars) {
        if (active.has(id)) continue;
        destroyCar(car);
        cars.delete(id);
      }
    },
    destroy() {
      cars.forEach(destroyCar);
      cars.clear();
    },
  };
}
