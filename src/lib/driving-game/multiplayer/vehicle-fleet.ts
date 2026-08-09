import type * as THREE from "three";
import { createVehicleView, type VehicleView } from "../vehicle/vehicle-view";
import type { AuthoritativeDrivingSnapshot } from "./simulation";

export type AuthoritativeVehicleFleet = {
  readonly size: number;
  update(snapshot: AuthoritativeDrivingSnapshot, dt: number): void;
  destroy(): void;
};

/** Owns one render-only car view per player in an interpolated network snapshot. */
export function createAuthoritativeVehicleFleet(scene: THREE.Scene): AuthoritativeVehicleFleet {
  const views = new Map<string, VehicleView>();
  return {
    get size() {
      return views.size;
    },
    update(snapshot, dt) {
      const active = new Set<string>();
      for (const player of snapshot.players) {
        active.add(player.playerId);
        let view = views.get(player.playerId);
        if (!view) {
          view = createVehicleView(scene);
          view.reset({ x: player.position[0], z: player.position[1] }, player.heading);
          views.set(player.playerId, view);
        }
        view.applyAuthoritativeSnapshot(player, dt);
      }
      for (const [playerId, view] of views) {
        if (active.has(playerId)) continue;
        view.destroy();
        views.delete(playerId);
      }
    },
    destroy() {
      for (const view of views.values()) view.destroy();
      views.clear();
    },
  };
}
