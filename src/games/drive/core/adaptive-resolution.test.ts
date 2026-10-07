import { describe, expect, it } from "vitest";
import { AdaptiveResolution } from "./adaptive-resolution";

function run(
  resolution: AdaptiveResolution,
  startMilliseconds: number,
  frames: number,
  interval: number,
  work: number,
) {
  let now = startMilliseconds;
  for (let frame = 0; frame < frames; frame++) {
    now += interval;
    resolution.sample(now, interval, work);
  }
  return now;
}

describe("AdaptiveResolution", () => {
  it("steps down under sustained GPU-bound slow frames and stops at the floor", () => {
    const resolution = new AdaptiveResolution({ windowSize: 10, minimumScale: 0.6 });
    run(resolution, 0, 10, 33, 6);
    expect(resolution.scale).toBeCloseTo(0.85);
    run(resolution, 1000, 100, 33, 6);
    expect(resolution.scale).toBe(0.6);
  });

  it("keeps resolution when the main thread is the bottleneck", () => {
    const resolution = new AdaptiveResolution({ windowSize: 10 });
    run(resolution, 0, 50, 33, 30);
    expect(resolution.scale).toBe(1);
  });

  it("recovers slowly and settles below a step that immediately failed", () => {
    const resolution = new AdaptiveResolution({ windowSize: 10, increaseCooldownMilliseconds: 1000 });
    let now = run(resolution, 0, 20, 33, 6);
    expect(resolution.scale).toBeCloseTo(0.7);
    now = run(resolution, now + 2000, 10, 16.7, 6);
    expect(resolution.scale).toBeCloseTo(0.8);
    // The higher scale cannot hold 60 fps, so it drops back and never retries above 0.7.
    now = run(resolution, now, 10, 33, 6);
    expect(resolution.scale).toBeCloseTo(0.65);
    now = run(resolution, now + 2000, 200, 16.7, 6);
    expect(resolution.scale).toBeCloseTo(0.7);
  });

  it("ignores windows interrupted by long gaps", () => {
    const resolution = new AdaptiveResolution({ windowSize: 10 });
    run(resolution, 0, 9, 33, 6);
    resolution.sample(1000, 1500, 6);
    run(resolution, 1000, 9, 33, 6);
    expect(resolution.scale).toBe(1);
  });
});
