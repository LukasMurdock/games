import { CHASE_MODE } from "./chase";
import { CRUISE_MODE } from "./cruise";
import type { GameModeDefinition } from "./types";

export const GAME_MODES = {
  cruise: CRUISE_MODE,
  chase: CHASE_MODE,
} satisfies Record<string, GameModeDefinition>;

export type GameModeId = keyof typeof GAME_MODES;
export type { GameModeContext, GameModeController, GameModeDefinition } from "./types";
