import * as THREE from "three";
import { createDriftSmoke, createSkidMarks } from "../vehicle/effects";
import { createVehicleView, type VehicleView } from "../vehicle/vehicle-view";
import type { AuthoritativeDrivingSnapshot } from "./simulation";

export type AuthoritativeVehicleFleet = {
  readonly size: number;
  update(snapshot: AuthoritativeDrivingSnapshot, dt: number): void;
  destroy(): void;
};

type VehiclePresentation = {
  view: VehicleView;
  smoke: ReturnType<typeof createDriftSmoke>;
  skidMarks: ReturnType<typeof createSkidMarks>;
  previousPosition: THREE.Vector3;
};

/** Owns one render-only car and effects presentation per authoritative player. */
export function createAuthoritativeVehicleFleet(scene: THREE.Scene): AuthoritativeVehicleFleet {
  const presentations = new Map<string, VehiclePresentation>();

  function destroyPresentation(presentation: VehiclePresentation) {
    presentation.view.destroy();
    presentation.smoke.destroy();
    presentation.skidMarks.destroy();
  }

  return {
    get size() {
      return presentations.size;
    },
    update(snapshot, dt) {
      const active = new Set<string>();
      const paused = snapshot.paused === true;
      for (const player of snapshot.players) {
        active.add(player.playerId);
        const position = new THREE.Vector3(player.position[0], 0.06, player.position[1]);
        let presentation = presentations.get(player.playerId);
        if (!presentation) {
          const view = createVehicleView(scene);
          view.reset({ x: player.position[0], z: player.position[1] }, player.heading);
          presentation = {
            view,
            smoke: createDriftSmoke(scene),
            skidMarks: createSkidMarks(scene),
            previousPosition: position.clone(),
          };
          presentations.set(player.playerId, presentation);
        }
        presentation.view.applyAuthoritativeSnapshot(player, dt, paused);
        const distance = paused ? 0 : position.distanceTo(presentation.previousPosition);
        const slipDegrees = Math.abs(THREE.MathUtils.radToDeg(player.visualSlip));
        const slipIntensity = paused
          ? 0
          : THREE.MathUtils.clamp((slipDegrees - 5) / 30, 0, 1)
            * THREE.MathUtils.clamp(player.speed / 10, 0, 1);
        presentation.smoke.update(paused ? 0 : dt, position, player.heading, slipIntensity, player.speed);
        presentation.skidMarks.update(position, player.heading, slipIntensity, distance);
        presentation.previousPosition.copy(position);
      }
      for (const [playerId, presentation] of presentations) {
        if (active.has(playerId)) continue;
        destroyPresentation(presentation);
        presentations.delete(playerId);
      }
    },
    destroy() {
      for (const presentation of presentations.values()) destroyPresentation(presentation);
      presentations.clear();
    },
  };
}
