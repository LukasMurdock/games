import type * as THREE from "three";
import type { DrivingProfile } from "../driving-profiles";
import { createPlayerController } from "../player/player-controller";
import type { PlayerController, PlayerEvent } from "../player/types";
import type { ControlMode, DriveEndReason } from "../types";
import type { WorldRuntime } from "../world/types";

/**
 * Offline session composition. The browser runtime depends on this boundary so
 * a future network session can provide authoritative snapshots without changing
 * input, camera, HUD, or presentation ownership.
 */
export function createLocalDrivingSession(options: {
  scene: THREE.Scene;
  world: WorldRuntime;
  profile: DrivingProfile;
  controlMode: ControlMode;
  onEvent: (event: PlayerEvent) => void;
  onResetRequested: (reason: DriveEndReason) => void;
}): PlayerController {
  return createPlayerController(options);
}
