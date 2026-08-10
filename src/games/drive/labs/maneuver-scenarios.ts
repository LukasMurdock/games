import type { DrivingProfileName } from "../driving-profiles";
import { DRIVING_PROFILES } from "../driving-profiles";
import type { DrivingControlName } from "../core/controls";
import { createDrivingVehicleSimulation } from "../simulation/vehicle-simulation";
import type { ControlMode, DriftPhase } from "../types";

export type ManeuverId = "idle" | "launch" | "circle" | "linked";
export type ManeuverControlState = Record<DrivingControlName, boolean>;

export type ManeuverScenario = {
  id: ManeuverId;
  title: string;
  shortTitle: string;
  description: string;
  duration: number;
  controlMode?: ControlMode;
  controlsAt(time: number): ManeuverControlState;
};

export type ManeuverTraceSample = {
  time: number;
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  heading: number;
  speed: number;
  forwardSpeed: number;
  signedSlipDegrees: number;
  steering: number;
  steeringLoad: number;
  throttle: number;
  braking: boolean;
  handbrake: boolean;
  boosting: boolean;
  phase: DriftPhase;
  onPavement: boolean;
  controls: ManeuverControlState;
};

const NO_CONTROLS = controls();

export const MANEUVER_SCENARIOS: Record<ManeuverId, ManeuverScenario> = {
  idle: {
    id: "idle",
    title: "Stationary engine idle",
    shortTitle: "Idle",
    description: "The production manual-control state at rest with the engine running and no driver input.",
    duration: 5,
    controlMode: "manual",
    controlsAt: () => NO_CONTROLS,
  },
  launch: {
    id: "launch",
    title: "Stopped to full speed",
    shortTitle: "Full-speed pull",
    description: "A production automatic launch in a straight line through every transmission event.",
    duration: 5,
    controlsAt: () => NO_CONTROLS,
  },
  circle: {
    id: "circle",
    title: "Continuous drift circle",
    shortTitle: "Drift circle",
    description: "Build speed, initiate breakaway, then hold a real sustained left-hand drift.",
    duration: 13,
    controlsAt: (time) => time >= 3 && time < 11.5
      ? controls({ left: true, handbrake: true })
      : NO_CONTROLS,
  },
  linked: {
    id: "linked",
    title: "Continuous linked drifts",
    shortTitle: "Linked S-turns",
    description: "Alternating production steering and handbrake inputs link repeated left/right transitions.",
    duration: 14,
    controlsAt(time) {
      if (time < 3 || time >= 11.7) return NO_CONTROLS;
      const link = Math.floor((time - 3) / 1.45);
      return controls({
        left: link % 2 === 0,
        right: link % 2 === 1,
        handbrake: true,
      });
    },
  },
};

const OPEN_WORLD = {
  spawn: { x: 0, z: 0, heading: 0 },
  isOnPavement: () => true,
  queryCollision: () => null,
  isOutsideBoundary: () => false,
};

export function buildManeuverTrace(
  scenarioId: ManeuverId,
  profileName: DrivingProfileName = "aggressive",
  sampleRate = 120,
): ManeuverTraceSample[] {
  const scenario = MANEUVER_SCENARIOS[scenarioId];
  const simulation = createDrivingVehicleSimulation({
    world: OPEN_WORLD,
    profile: DRIVING_PROFILES[profileName],
    controlMode: scenario.controlMode ?? "automatic",
  });
  const dt = 1 / sampleRate;
  const samples: ManeuverTraceSample[] = [];
  let previousControls = controls();
  for (let index = 0; index <= Math.round(scenario.duration * sampleRate); index++) {
    const time = index / sampleRate;
    const nextControls = scenario.controlsAt(time);
    for (const name of CONTROL_NAMES) {
      if (nextControls[name] !== previousControls[name]) {
        simulation.setControl(name, nextControls[name]);
      }
    }
    previousControls = { ...nextControls };
    const frame = simulation.update(dt);
    samples.push({
      time,
      position: { ...frame.position },
      velocity: { ...frame.velocity },
      heading: frame.heading,
      speed: frame.speed,
      forwardSpeed: frame.forwardSpeed,
      signedSlipDegrees: frame.visualSlip * 180 / Math.PI,
      steering: frame.steering,
      steeringLoad: Math.abs(frame.steering) * Math.min(1, frame.speed / 14),
      throttle: frame.throttle,
      braking: frame.braking,
      handbrake: frame.handbrake,
      boosting: frame.boosting,
      phase: frame.driftPhase,
      onPavement: frame.onPavement,
      controls: { ...nextControls },
    });
  }
  return samples;
}

export function sampleManeuverTrace(trace: ManeuverTraceSample[], time: number) {
  const sampleRate = trace.length > 1 ? 1 / (trace[1].time - trace[0].time) : 120;
  return trace[Math.max(0, Math.min(trace.length - 1, Math.round(time * sampleRate)))];
}

export function maneuverSegmentsForTrace(
  scenario: ManeuverScenario,
  trace: ManeuverTraceSample[],
): readonly { start: number; label: string }[] {
  if (scenario.id === "idle") return [{ start: 0, label: "Idle" }];
  if (scenario.id === "launch") {
    const maximumSpeed = Math.max(...trace.map((sample) => sample.speed));
    return [
      { start: 0, label: "Launch" },
      { start: trace.find((sample) => sample.speed >= 5)?.time ?? scenario.duration, label: "Acceleration" },
      {
        start: trace.find((sample) => sample.speed >= maximumSpeed - 0.05)?.time ?? scenario.duration,
        label: "Maximum speed",
      },
    ];
  }

  const segments: { start: number; label: string }[] = [{ start: 0, label: "Approach" }];
  let previousPhase = trace[0].phase;
  for (const sample of trace.slice(1)) {
    if (sample.phase === previousPhase) continue;
    previousPhase = sample.phase;
    const direction = sample.controls.left ? "Left" : sample.controls.right ? "Right" : "";
    const label = sample.phase === "breakaway"
      ? `${direction} breakaway`.trim()
      : sample.phase === "sustain"
        ? scenario.id === "circle" ? "Sustained circle" : `${direction} drift`.trim()
        : sample.phase === "transition"
          ? `Link ${direction.toLowerCase()}`.trim()
          : sample.phase === "recover" ? "Recovery" : "Grip";
    if (segments.at(-1)?.label !== label) segments.push({ start: sample.time, label });
  }
  return segments;
}

export function maneuverSegmentAt(
  segments: readonly { start: number; label: string }[],
  time: number,
) {
  return [...segments].reverse().find((segment) => time >= segment.start) ?? segments[0];
}

const CONTROL_NAMES: DrivingControlName[] = ["left", "right", "accelerate", "brake", "handbrake"];
function controls(overrides: Partial<ManeuverControlState> = {}): ManeuverControlState {
  return { left: false, right: false, accelerate: false, brake: false, handbrake: false, ...overrides };
}
