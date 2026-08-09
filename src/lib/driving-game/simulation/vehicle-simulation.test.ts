import { describe, expect, it } from "vitest";
import { DRIVING_PROFILES } from "../driving-profiles";
import { createDrivingVehicleSimulation } from "./vehicle-simulation";

const openWorld = {
  spawn: { x: 0, z: 0, heading: 0 },
  isOnPavement: () => true,
  queryCollision: () => null,
  isOutsideBoundary: () => false,
};

describe("presentation-free production vehicle simulation", () => {
  it("advances the same driving mechanics without a scene or browser clock", () => {
    const vehicle = createDrivingVehicleSimulation({
      world: openWorld,
      profile: DRIVING_PROFILES.balanced,
      controlMode: "manual",
    });
    vehicle.setControl("accelerate", true);
    for (let index = 0; index < 120; index++) vehicle.update(1 / 60);
    const snapshot = vehicle.snapshot();
    expect(snapshot.position.z).toBeGreaterThan(10);
    expect(snapshot.speed).toBeGreaterThan(10);
    expect(snapshot.position).toEqual({ x: 0, z: expect.any(Number) });
  });

  it("accepts numeric world queries and emits plain detached snapshots", () => {
    const vehicle = createDrivingVehicleSimulation({
      world: { ...openWorld, spawn: { x: 4, z: 8, heading: 1 } },
      profile: DRIVING_PROFILES.balanced,
      controlMode: "manual",
    });
    const first = vehicle.snapshot();
    first.position.x = 1000;
    expect(vehicle.snapshot().position.x).toBe(4);
  });
});
