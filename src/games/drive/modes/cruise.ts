import { createIdleModeController, type GameModeDefinition } from "./types";

export const CRUISE_MODE: GameModeDefinition = {
  id: "cruise",
  available: true,
  drivingProfile: "loose",
  copy: {
    eyebrow: "A tiny driving playground",
    title: "Take a drive.",
    description: "Link corners, explore the open pavement, or simply follow whatever line looks fun. There is nowhere you need to be.",
    startLabel: "Start driving",
  },
  createController: createIdleModeController,
};
