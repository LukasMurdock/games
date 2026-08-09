import type * as THREE from "three";
import type { DrivingProfileName } from "../driving-profiles";
import type { GameMapDefinition } from "../maps";
import type { PlayerEvent, PlayerExternalCollision, PlayerSnapshot } from "../player";
import type { DriveEndReason } from "../types";
import type { WorldRuntime } from "../world/types";

export type GameModeContext = {
  scene: THREE.Scene;
  hudRoot: HTMLElement;
  map: GameMapDefinition;
  world: WorldRuntime;
  getPlayer: () => PlayerSnapshot;
  applyPlayerCollision: (collision: PlayerExternalCollision) => void;
  getDriveTime: () => number;
  endDrive: () => void;
};

export type GameModeController = {
  start: () => void;
  update: (dt: number) => void;
  isDriveClockRunning: () => boolean;
  pause: (paused: boolean) => void;
  reset: (reason: DriveEndReason) => void;
  onPlayerEvent: (event: PlayerEvent) => void;
  destroy: () => void;
};

export type GameModeDefinition = {
  id: string;
  available: boolean;
  drivingProfile: DrivingProfileName;
  copy: {
    eyebrow: string;
    title: string;
    description: string;
    startLabel: string;
  };
  createController: (context: GameModeContext) => GameModeController;
};

export function createIdleModeController(): GameModeController {
  return {
    start() {},
    update() {},
    isDriveClockRunning: () => true,
    pause() {},
    reset() {},
    onPlayerEvent() {},
    destroy() {},
  };
}
