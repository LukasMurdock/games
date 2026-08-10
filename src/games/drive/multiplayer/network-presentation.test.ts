import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createNetworkDrivingPresentation } from "./network-presentation";
import type { AuthoritativeDrivingSnapshot } from "./simulation";

const snapshot: AuthoritativeDrivingSnapshot = {
  players: [{
    playerId: "driver",
    position: [1, 2],
    velocity: [0, 1],
    heading: 0,
    speed: 1,
    visualSlip: 0,
    driftPhase: "grip",
    boosting: false,
    exitPulse: 0,
  }],
};

describe("network driving presentation", () => {
  it("feeds sampled state into the render-only fleet and clears on session loss", () => {
    const scene = new THREE.Scene();
    let current: AuthoritativeDrivingSnapshot | null = snapshot;
    const presentation = createNetworkDrivingPresentation(scene, { sample: () => current });
    expect(presentation.update(1 / 60)).toBe(snapshot);
    expect(presentation.vehicleCount).toBe(1);
    current = null;
    presentation.update(1 / 60);
    expect(presentation.vehicleCount).toBe(0);
    presentation.destroy();
  });
});
