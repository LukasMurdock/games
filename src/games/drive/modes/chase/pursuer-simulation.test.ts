import { describe, expect, it } from "vitest";
import { createPursuerSimulation } from "./pursuer-simulation";

const world = {
  spawn: { x: 0, z: 0, heading: 0 },
  isOnPavement: () => true,
  queryCollision: () => null,
  isOutsideBoundary: () => false,
};
const target = {
  position: { x: 0, z: 0 },
  velocity: { x: 0, z: 0 },
  heading: 0,
  speed: 0,
};

describe("presentation-free pursuer simulation", () => {
  it("is deterministic and reaches a stationary target", () => {
    const first = createPursuerSimulation(world);
    const second = createPursuerSimulation(world);
    expect(first.resetBehind(target)).toBe(true);
    expect(second.resetBehind(target)).toBe(true);
    let collision = null;
    for (let index = 0; index < 360; index++) {
      collision = first.update(1 / 60, target, 0.5).targetCollision ?? collision;
      second.update(1 / 60, target, 0.5);
    }
    expect(first.snapshot()).toEqual(second.snapshot());
    expect(collision).not.toBeNull();
  });

  it("fails closed when no safe police placement exists", () => {
    const blocked = createPursuerSimulation({
      ...world,
      queryCollision: () => ({
        normalX: 1,
        normalZ: 0,
        penetration: 1,
        kind: "building" as const,
        resetsCar: false,
      }),
    });
    expect(blocked.resetBehind(target)).toBe(false);
  });
});
