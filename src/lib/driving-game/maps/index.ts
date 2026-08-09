import { CITY_CIRCUIT_MAP } from "./city-circuit";
import { CROSSWIND_MAP } from "./crosswind";
import { HIGH_PLAINS_MAP } from "./high-plains";
import { METRO_RING_MAP } from "./metro-ring";
import { NORTHPOINT_MAP } from "./northpoint";
import { SWITCHYARD_MAP } from "./switchyard";
import type { GameMapDefinition } from "./types";

export const GAME_MAPS = {
  "city-circuit": CITY_CIRCUIT_MAP,
  crosswind: CROSSWIND_MAP,
  switchyard: SWITCHYARD_MAP,
  "high-plains": HIGH_PLAINS_MAP,
  "metro-ring": METRO_RING_MAP,
  northpoint: NORTHPOINT_MAP,
} satisfies Record<string, GameMapDefinition>;

export type GameMapId = keyof typeof GAME_MAPS;
export const DEFAULT_GAME_MAP_ID = "city-circuit" satisfies GameMapId;

export function isGameMapId(value: string | null): value is GameMapId {
  return value !== null && Object.prototype.hasOwnProperty.call(GAME_MAPS, value);
}

export type { GameMapDefinition } from "./types";
