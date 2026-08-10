import * as THREE from "three";
import type { PlayerExternalCollision, PlayerSnapshot } from "../../player";
import { createCar } from "../../vehicle/create-car";
import { createDrivingWorldQuery } from "../../world/driving-world-query";
import type { WorldRuntime } from "../../world/types";
import { createPursuerSimulation } from "./pursuer-simulation";

export type PursuerUpdate = {
  distanceToPlayer: number;
  playerCollision: PlayerExternalCollision | null;
  respawned: boolean;
};

export type Pursuer = {
  setVisible: (visible: boolean) => void;
  resetBehind: (player: PlayerSnapshot, formationIndex?: number) => boolean;
  update: (dt: number, player: PlayerSnapshot, accuracy: number) => PursuerUpdate;
  destroy: () => void;
};

/** Local Three.js adapter around the same presentation-free police mechanics used online. */
export function createPursuer(scene: THREE.Scene, world: WorldRuntime): Pursuer {
  const car = createCar({ police: true });
  const simulation = createPursuerSimulation(createDrivingWorldQuery(world));
  scene.add(car.group);
  let sirenTime = 0;

  function target(player: PlayerSnapshot) {
    return {
      position: { x: player.position.x, z: player.position.z },
      velocity: { x: player.velocity.x, z: player.velocity.z },
      heading: player.heading,
      speed: player.speed,
    };
  }

  function applySnapshot(dt = 0) {
    const snapshot = simulation.snapshot();
    car.group.position.set(snapshot.position.x, 0.06, snapshot.position.z);
    car.group.rotation.y = snapshot.heading;
    car.frontWheels.forEach((wheel) => { wheel.rotation.y = snapshot.steering; });
    car.wheels.forEach((wheel) => { wheel.rotation.x += snapshot.speed * dt / 0.42; });
    sirenTime += dt;
    car.emergencyLights.forEach((light, index) => {
      const material = light.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = Math.sin(sirenTime * 16 + index * Math.PI) > 0 ? 7 : 0.65;
    });
  }

  return {
    setVisible(visible) { car.group.visible = visible; },
    resetBehind(player, formationIndex = 0) {
      const placed = simulation.resetBehind(target(player), formationIndex);
      if (placed) applySnapshot();
      return placed;
    },
    update(dt, player, accuracy) {
      const result = simulation.update(dt, target(player), accuracy);
      applySnapshot(dt);
      return {
        distanceToPlayer: result.distanceToTarget,
        playerCollision: result.targetCollision,
        respawned: result.respawned,
      };
    },
    destroy() {
      scene.remove(car.group);
      car.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
    },
  };
}
