import { describe, expect, it } from "vitest";
import { createDrivingControlState } from "./controls";

describe("driving control state", () => {
  it("detects hard-drift double taps from simulation time", () => {
    const controls = createDrivingControlState(0.27);
    expect(controls.set("left", true).hardDriftDoubleTap).toBe(false);
    controls.set("left", false);
    controls.advance(0.2);
    expect(controls.set("left", true).hardDriftDoubleTap).toBe(true);
  });

  it("rejects late and opposite-direction second taps", () => {
    const controls = createDrivingControlState(0.27);
    controls.set("left", true);
    controls.set("left", false);
    controls.advance(0.28);
    expect(controls.set("left", true).hardDriftDoubleTap).toBe(false);
    controls.set("left", false);
    controls.advance(0.1);
    expect(controls.set("right", true).hardDriftDoubleTap).toBe(false);
  });

  it("clears held controls and tap history", () => {
    const controls = createDrivingControlState(0.27);
    controls.set("accelerate", true);
    controls.set("left", true);
    controls.clear();
    expect(controls.pressed.accelerate).toBe(false);
    expect(controls.pressed.left).toBe(false);
    controls.advance(0.1);
    expect(controls.set("left", true).hardDriftDoubleTap).toBe(false);
  });
});
