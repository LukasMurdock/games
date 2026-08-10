import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { AuthoritativeDrivingPlayer } from "./simulation";
import { createAuthoritativeVehicleFleet } from "./vehicle-fleet";

function player(playerId: string, x: number): AuthoritativeDrivingPlayer {
  return {
    playerId,
    position: [x, 0],
    velocity: [1, 0],
    heading: Math.PI / 2,
    speed: 1,
    visualSlip: 0,
    driftPhase: "grip",
    boosting: false,
    exitPulse: 0,
  };
}

describe("authoritative vehicle fleet presentation", () => {
  it("renders authoritative front-wheel steering", () => {
    const scene = new THREE.Scene();
    const fleet = createAuthoritativeVehicleFleet(scene);
    fleet.update({ players: [{ ...player("one", 0), steering: 1 }] }, 1);
    const steeringPivots: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (object.children.some((child) => (
        child instanceof THREE.Mesh && child.geometry instanceof THREE.CylinderGeometry
      )) && object.position.z > 0) steeringPivots.push(object);
    });
    expect(steeringPivots).toHaveLength(2);
    expect(steeringPivots.every((pivot) => pivot.rotation.y > 0.4)).toBe(true);
    fleet.destroy();
  });

  it("freezes wheel animation while authoritative state is paused", () => {
    const scene = new THREE.Scene();
    const fleet = createAuthoritativeVehicleFleet(scene);
    fleet.update({ players: [player("one", 0)], paused: false }, 1);
    const wheels: THREE.Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry instanceof THREE.CylinderGeometry) wheels.push(object);
    });
    const spinning = wheels.map((wheel) => wheel.rotation.x);
    expect(spinning.some((rotation) => rotation !== 0)).toBe(true);
    fleet.update({ players: [player("one", 0)], paused: true }, 1);
    expect(wheels.map((wheel) => wheel.rotation.x)).toEqual(spinning);
    fleet.destroy();
  });

  it("creates authoritative skid marks from interpolated travel and slip", () => {
    const scene = new THREE.Scene();
    const fleet = createAuthoritativeVehicleFleet(scene);
    const drifting = { ...player("one", 0), speed: 10, visualSlip: Math.PI / 4 };
    fleet.update({ players: [drifting] }, 1 / 60);
    fleet.update({ players: [{ ...drifting, position: [1, 0] }] }, 1 / 60);
    const marks = scene.children.find((child) => (
      child instanceof THREE.InstancedMesh
      && child.geometry instanceof THREE.BoxGeometry
      && child.count > 0
    )) as THREE.InstancedMesh | undefined;
    expect(marks?.count).toBe(2);
    fleet.destroy();
  });

  it("creates, updates, and removes one render-only presentation per snapshot player", () => {
    const scene = new THREE.Scene();
    const fleet = createAuthoritativeVehicleFleet(scene);
    fleet.update({ players: [player("one", 0), player("two", 4)] }, 1 / 60);
    expect(fleet.size).toBe(2);
    fleet.update({ players: [player("two", 5)] }, 1 / 60);
    expect(fleet.size).toBe(1);
    fleet.destroy();
    expect(fleet.size).toBe(0);
    expect(scene.children).toHaveLength(0);
  });
});
