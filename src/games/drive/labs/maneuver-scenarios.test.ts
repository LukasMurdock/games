import { describe, expect, it } from "vitest";
import {
  buildManeuverTrace,
  maneuverSegmentsForTrace,
  MANEUVER_SCENARIOS,
} from "./maneuver-scenarios";

describe("production maneuver traces", () => {
  it("holds the real manual-control idle state without vehicle input", () => {
    const trace = buildManeuverTrace("idle");
    expect(trace.every((sample) => sample.speed === 0)).toBe(true);
    expect(trace.every((sample) => sample.throttle === 0)).toBe(true);
    expect(trace.every((sample) => sample.phase === "grip")).toBe(true);
    expect(maneuverSegmentsForTrace(MANEUVER_SCENARIOS.idle, trace))
      .toEqual([{ start: 0, label: "Idle" }]);
  });

  it("launches from stopped to the aggressive speed ceiling in a straight line", () => {
    const trace = buildManeuverTrace("launch");
    expect(trace[0].speed).toBeLessThan(0.2);
    expect(trace.at(-1)?.speed).toBeGreaterThan(27);
    expect(Math.max(...trace.map((sample) => Math.abs(sample.position.x)))).toBeLessThan(0.01);
    expect(new Set(trace.map((sample) => sample.phase))).toEqual(new Set(["grip"]));
    const maximumSpeed = maneuverSegmentsForTrace(MANEUVER_SCENARIOS.launch, trace)
      .find((segment) => segment.label === "Maximum speed")?.start;
    expect(maximumSpeed).toBeGreaterThan(2);
    expect(maximumSpeed).toBeLessThan(3);
  });

  it("sustains meaningful slip while circling", () => {
    const trace = buildManeuverTrace("circle");
    const sustained = trace.filter((sample) => sample.time >= 4 && sample.time < 11.5);
    expect(sustained.filter((sample) => Math.abs(sample.signedSlipDegrees) > 12).length)
      .toBeGreaterThan(sustained.length * 0.7);
    const accumulatedTurn = sustained.slice(1).reduce((total, sample, index) => {
      const difference = Math.atan2(
        Math.sin(sample.heading - sustained[index].heading),
        Math.cos(sample.heading - sustained[index].heading),
      );
      return total + Math.abs(difference);
    }, 0);
    expect(accumulatedTurn).toBeGreaterThan(Math.PI * 1.5);
    const segments = maneuverSegmentsForTrace(MANEUVER_SCENARIOS.circle, trace);
    expect(segments.find((segment) => segment.label.includes("breakaway"))?.start)
      .toBe(trace.find((sample) => sample.phase === "breakaway")?.time);
    expect(segments.find((segment) => segment.label === "Sustained circle")?.start)
      .toBe(trace.find((sample) => sample.phase === "sustain")?.time);
  });

  it("links repeated left and right drift transitions", () => {
    const trace = buildManeuverTrace("linked");
    const linked = trace.filter((sample) => sample.time >= 3 && sample.time < 11.7);
    const slipSigns = linked
      .filter((sample) => Math.abs(sample.signedSlipDegrees) > 10)
      .map((sample) => Math.sign(sample.signedSlipDegrees));
    let changes = 0;
    for (let index = 1; index < slipSigns.length; index++) {
      if (slipSigns[index] !== slipSigns[index - 1]) changes++;
    }
    expect(changes).toBeGreaterThanOrEqual(4);
    expect(new Set(linked.map((sample) => sample.phase))).toContain("transition");
    const simulatedTransitions = trace.filter((sample, index) => (
      sample.phase === "transition" && trace[index - 1]?.phase !== "transition"
    ));
    const timelineLinks = maneuverSegmentsForTrace(MANEUVER_SCENARIOS.linked, trace)
      .filter((segment) => segment.label.startsWith("Link"));
    expect(timelineLinks.map((segment) => segment.start))
      .toEqual(simulatedTransitions.map((sample) => sample.time));
  });
});
