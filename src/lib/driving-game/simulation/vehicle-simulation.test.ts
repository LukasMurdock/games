import { describe, expect, it } from "vitest";
import type { DrivingWorldQuery } from "../core/world-query";
import { DRIVING_PROFILES } from "../driving-profiles";
import type { DrivingSimulationEvent } from "./types";
import { createDrivingVehicleSimulation } from "./vehicle-simulation";

const openWorld: DrivingWorldQuery = {
  spawn: { x: 0, z: 0, heading: 0 },
  isOnPavement: () => true,
  queryCollision: () => null,
  isOutsideBoundary: () => false,
};

function automaticVehicle(options: {
  world?: DrivingWorldQuery;
  onEvent?: (event: DrivingSimulationEvent) => void;
  onResetRequested?: () => void;
} = {}) {
  return createDrivingVehicleSimulation({
    world: options.world ?? openWorld,
    profile: DRIVING_PROFILES.balanced,
    controlMode: "automatic",
    onEvent: options.onEvent,
    onResetRequested: options.onResetRequested,
  });
}

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

  it("preserves automatic acceleration and maximum-speed behavior", () => {
    const vehicle = automaticVehicle();
    for (let index = 0; index < 600; index++) vehicle.update(1 / 60);
    expect(vehicle.snapshot().position.z).toBeGreaterThan(100);
    expect(vehicle.snapshot().speed).toBeGreaterThan(20);
    expect(vehicle.snapshot().speed).toBeLessThanOrEqual(DRIVING_PROFILES.balanced.maximumSpeed);
  });

  it("runs drift and hard-drift transitions from simulation-time controls", () => {
    const phases: string[] = [];
    const vehicle = automaticVehicle({
      onEvent: (event) => {
        if (event.type === "drift-phase") phases.push(event.phase);
      },
    });
    for (let index = 0; index < 45; index++) vehicle.update(1 / 60);
    vehicle.setControl("left", true);
    vehicle.setControl("left", false);
    for (let index = 0; index < 6; index++) vehicle.update(1 / 60);
    vehicle.setControl("left", true);
    vehicle.update(1 / 60);
    expect(phases).toContain("breakaway");
    vehicle.setControl("handbrake", true);
    for (let index = 0; index < 20; index++) vehicle.update(1 / 60);
    expect(phases).toContain("sustain");
  });

  it("preserves off-road drag and boundary reset requests", () => {
    const pavement = automaticVehicle();
    let resets = 0;
    const offRoad = automaticVehicle({
      world: {
        ...openWorld,
        isOnPavement: () => false,
        isOutsideBoundary: (_x, z) => z > 300,
      },
      onResetRequested: () => { resets += 1; },
    });
    for (let index = 0; index < 300; index++) {
      pavement.update(1 / 60);
      offRoad.update(1 / 60);
    }
    expect(offRoad.snapshot().speed).toBeLessThan(pavement.snapshot().speed);
    for (let index = 0; index < 600 && resets === 0; index++) offRoad.update(1 / 60);
    expect(resets).toBe(1);
  });
});
