import type * as THREE from "three";
import type { NetworkDrivingSession } from "./network-session";
import { createAuthoritativeVehicleFleet } from "./vehicle-fleet";

/** Connects interpolated network snapshots to render-only Three.js vehicle views. */
export function createNetworkDrivingPresentation(
  scene: THREE.Scene,
  session: Pick<NetworkDrivingSession, "sample">,
) {
  const fleet = createAuthoritativeVehicleFleet(scene);
  return {
    get vehicleCount() {
      return fleet.size;
    },
    update(dt: number, now?: number) {
      const snapshot = session.sample(now);
      fleet.update(snapshot ?? { players: [] }, dt);
      return snapshot;
    },
    destroy() {
      fleet.destroy();
    },
  };
}
