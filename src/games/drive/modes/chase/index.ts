import type { GameModeDefinition } from "../types";
import { createChaseController } from "./chase-controller";

export const CHASE_MODE: GameModeDefinition = {
  id: "chase",
  available: true,
  drivingProfile: "aggressive",
  copy: {
    eyebrow: "Car chase",
    title: "Lose them.",
    description: "Keep moving, use the city, and survive as long as you can while the pursuit grows.",
    startLabel: "Start chase",
  },
  createController: createChaseController,
};
