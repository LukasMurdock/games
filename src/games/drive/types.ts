import type { DrivingProfileName } from "./driving-profiles";
import type { GameMapId } from "./maps";
import type { GameModeId } from "./modes";

export type CameraMode = "Chase" | "Isometric" | "Side";
export type ControlMode = "automatic" | "manual";
export type DriftPhase = "grip" | "breakaway" | "sustain" | "transition" | "recover";
export type DriveEndReason = "manual" | "collision" | "boundary" | "mode";

export type DrivingGameOptions = {
  mode?: GameModeId;
  map?: GameMapId;
  drivingProfile?: DrivingProfileName;
};
