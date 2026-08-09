import { createDrivingControlState } from "../core/controls";
import type { ControlMode, DriftPhase } from "../types";
import type {
  DrivingExternalCollision,
  DrivingVehicleFrame,
  DrivingVehicleSimulation,
  DrivingVehicleSimulationOptions,
  DrivingVehicleSnapshot,
} from "./types";

export type {
  DrivingExternalCollision,
  DrivingSimulationEvent,
  DrivingVehicleFrame,
  DrivingVehicleSimulation,
  DrivingVehicleSnapshot,
} from "./types";

const CAR_RADIUS = 1.25;
type Vec2 = { x: number; z: number };

/** Production vehicle mechanics with no renderer, audio, DOM, or browser clock. */
export function createDrivingVehicleSimulation(
  options: DrivingVehicleSimulationOptions,
): DrivingVehicleSimulation {
  let world = options.world;
  let profile = options.profile;
  let controlMode: ControlMode = options.controlMode;
  const onEvent = options.onEvent ?? (() => undefined);
  const onResetRequested = options.onResetRequested ?? (() => undefined);
  const position: Vec2 = { x: world.spawn.x, z: world.spawn.z };
  const velocity: Vec2 = { x: 0, z: 0 };
  let heading = world.spawn.heading;
  let cameraShake = 0;
  let driftPhase: DriftPhase = "grip";
  let reportedDriftPhase: DriftPhase = "grip";
  let driftDirection = 0;
  let driftTime = 0;
  let phaseTime = 0;
  let yawVelocity = 0;
  let driftInputBuffer = 0;
  let hardDriftInputBuffer = 0;
  let hardDriftKick = 0;
  let hardDriftEntry = false;
  let hardDriftReentryTime = 0;
  let hardDriftReentryDirection = 0;
  let transitionIntentTime = 0;
  let transitionStartSlip = 0;
  let driftEntrySpeed = 0;
  let driftStayedOnPavement = true;
  let exitBoost = 0;
  let exitBoostForce = 0;
  let exitPulse = 0;
  let visualSlip = 0;
  let bodyKick = 0;
  let previousHandbrake = false;
  const controlState = createDrivingControlState(profile.hardDrift.doubleTapWindow);
  const controls = controlState.pressed;

  function setControl(name: Parameters<DrivingVehicleSimulation["setControl"]>[0], pressed: boolean) {
    const tapDirection = name === "left" ? 1 : name === "right" ? -1 : 0;
    if (
      pressed && tapDirection !== 0 && hardDriftReentryTime > 0
      && tapDirection !== hardDriftReentryDirection
    ) {
      hardDriftReentryTime = 0;
      hardDriftReentryDirection = 0;
    }
    if (controlState.set(name, pressed).hardDriftDoubleTap) {
      hardDriftInputBuffer = profile.hardDrift.inputBuffer;
    }
  }

  function clearControls() {
    controlState.clear();
    hardDriftInputBuffer = 0;
    hardDriftReentryTime = 0;
    hardDriftReentryDirection = 0;
  }

  function reset() {
    position.x = world.spawn.x;
    position.z = world.spawn.z;
    velocity.x = 0;
    velocity.z = 0;
    heading = world.spawn.heading;
    driftPhase = "grip";
    reportedDriftPhase = "grip";
    driftDirection = 0;
    driftTime = 0;
    phaseTime = 0;
    yawVelocity = 0;
    driftInputBuffer = 0;
    hardDriftInputBuffer = 0;
    hardDriftKick = 0;
    hardDriftEntry = false;
    hardDriftReentryTime = 0;
    hardDriftReentryDirection = 0;
    controlState.clear();
    transitionIntentTime = 0;
    transitionStartSlip = 0;
    driftEntrySpeed = 0;
    driftStayedOnPavement = true;
    exitBoost = 0;
    exitBoostForce = 0;
    exitPulse = 0;
    visualSlip = 0;
    bodyKick = 0;
    cameraShake = 0;
    previousHandbrake = false;
  }

  function applyExternalCollision(collision: DrivingExternalCollision) {
    position.x += collision.normalX * collision.penetration;
    position.z += collision.normalZ * collision.penetration;
    const impactStrength = clamp(collision.closingSpeed / 14, 0, 1);
    if (collision.closingSpeed > 0) {
      const impulse = Math.min(collision.closingSpeed, 14) * 0.48;
      velocity.x += collision.normalX * impulse;
      velocity.z += collision.normalZ * impulse;
      scale(velocity, lerp(0.98, 0.88, impactStrength));
      cameraShake = Math.min(0.5, cameraShake + impactStrength * 0.22);
      onEvent({
        type: "collision",
        obstacleType: "vehicle",
        terminal: false,
        strength: impactStrength,
      });
    }
  }

  function update(dt: number): DrivingVehicleFrame {
    controlState.advance(dt);
    let forward = direction(heading);
    let forwardSpeed = dot(velocity, forward);
    const speed = length(velocity);
    const steer = Number(controls.left) - Number(controls.right);
    const handbrakePressed = controls.handbrake && !previousHandbrake;
    const throttleInput = controlMode === "automatic" ? 1 : Number(controls.accelerate);
    const reverseInput = controlMode === "manual" && controls.brake;
    let braking = false;
    let reversing = forwardSpeed < -0.35;
    const onPavement = world.isOnPavement(position.x, position.z);

    if (handbrakePressed) driftInputBuffer = profile.inputBuffer;
    else driftInputBuffer = Math.max(0, driftInputBuffer - dt);
    hardDriftInputBuffer = Math.max(0, hardDriftInputBuffer - dt);
    hardDriftReentryTime = Math.max(0, hardDriftReentryTime - dt);
    if (hardDriftReentryTime === 0) hardDriftReentryDirection = 0;
    previousHandbrake = controls.handbrake;

    const hardDirection = Math.sign(steer);
    const wantsHardReentry = handbrakePressed
      && hardDriftReentryTime > 0
      && forwardSpeed > profile.hardDrift.minimumSpeed
      && (hardDirection === 0 || hardDirection === hardDriftReentryDirection);
    const hardTriggerDirection = wantsHardReentry ? hardDriftReentryDirection : hardDirection;
    if (wantsHardReentry && hardDriftEntry) {
      hardDriftReentryTime = 0;
      hardDriftReentryDirection = 0;
    }
    const canDirectionalHardDrift = hardDriftInputBuffer > 0
      && forwardSpeed > profile.hardDrift.minimumSpeed
      && Math.abs(steer) > 0.16
      && (
        driftPhase === "grip"
        || driftPhase === "recover"
        || hardTriggerDirection === driftDirection
      );
    if (canDirectionalHardDrift || (wantsHardReentry && !hardDriftEntry)) {
      hardDriftInputBuffer = 0;
      hardDriftKick = 1;
      if (driftPhase === "grip" || driftPhase === "recover") {
        driftPhase = "breakaway";
        driftDirection = hardTriggerDirection;
        driftTime = 0;
        phaseTime = 0;
        transitionIntentTime = 0;
        driftEntrySpeed = speed;
        driftStayedOnPavement = onPavement;
      }
      hardDriftEntry = driftPhase === "breakaway";
      scale(velocity, profile.hardDrift.initialSpeedRetention);
      bodyKick = 1.25;
      cameraShake = Math.max(cameraShake, 0.11);
      driftInputBuffer = 0;
      if (wantsHardReentry || controls.handbrake) {
        hardDriftReentryTime = 0;
        hardDriftReentryDirection = 0;
      } else {
        hardDriftReentryTime = profile.hardDrift.reentryWindow;
        hardDriftReentryDirection = hardTriggerDirection;
      }
    }

    const canBreakAway = forwardSpeed > profile.drift.minimumSpeed && Math.abs(steer) > 0.16;
    if (driftPhase === "grip" && canBreakAway && (controls.handbrake || driftInputBuffer > 0)) {
      driftPhase = "breakaway";
      driftDirection = Math.sign(steer);
      driftTime = 0;
      phaseTime = 0;
      transitionIntentTime = 0;
      driftEntrySpeed = speed;
      driftStayedOnPavement = onPavement;
      hardDriftEntry = false;
      bodyKick = 1;
      cameraShake = Math.max(cameraShake, 0.075);
      driftInputBuffer = 0;
    }
    if (!hardDriftEntry && driftPhase !== "grip" && driftPhase !== "recover" && !controls.handbrake) {
      driftPhase = "recover";
      hardDriftEntry = false;
      phaseTime = 0;
      transitionIntentTime = 0;
    }
    if (!hardDriftEntry) {
      hardDriftKick = Math.max(0, hardDriftKick - dt / profile.hardDrift.kickDecay);
    }
    phaseTime += dt;
    if (driftPhase === "breakaway" || driftPhase === "sustain" || driftPhase === "transition") {
      driftTime += dt;
    }
    if (driftPhase !== "grip") driftStayedOnPavement &&= onPavement;

    if (controlMode === "automatic") {
      addScaled(velocity, forward, profile.acceleration * dt);
    } else {
      const opposingDirections = (throttleInput > 0 && reverseInput)
        || (throttleInput > 0 && forwardSpeed < -0.35)
        || (reverseInput && forwardSpeed > 0.35);
      const sidewaysMotion = Math.abs(forwardSpeed) <= 0.35 && speed > 0.5;
      if (opposingDirections || sidewaysMotion) {
        braking = true;
        const nextSpeed = Math.max(0, speed - profile.manual.brakeDeceleration * dt);
        if (speed > 0.0001) scale(velocity, nextSpeed / speed);
      } else if (throttleInput > 0) {
        addScaled(velocity, forward, profile.acceleration * dt);
      } else if (reverseInput && driftPhase === "grip") {
        addScaled(velocity, forward, -profile.manual.reverseAcceleration * dt);
        reversing = true;
      }
    }
    if (exitBoost > 0) {
      const boostEnvelope = Math.sin((exitBoost / profile.exitBoost.duration) * Math.PI);
      addScaled(velocity, forward, exitBoostForce * boostEnvelope * throttleInput * dt);
      exitBoost = Math.max(0, exitBoost - dt);
    }
    exitPulse = Math.max(0, exitPulse - dt * 2.3);
    bodyKick = Math.max(0, bodyKick - dt * 5.5);

    forwardSpeed = dot(velocity, forward);
    const currentSpeed = length(velocity);
    const minimumSteeringSpeed = controlMode === "automatic" ? 0.12 : 0;
    const speedRatio = clamp(Math.abs(forwardSpeed) / 12, minimumSteeringSpeed, 1);
    reversing = forwardSpeed < -0.35;
    const velocityHeading = currentSpeed > 0.4 ? Math.atan2(velocity.x, velocity.z) : heading;
    const motionReferenceHeading = reversing ? normalizeAngle(heading + Math.PI) : heading;
    const currentSlip = angleDifference(motionReferenceHeading, velocityHeading);
    const currentSlipDegrees = Math.abs(radToDeg(currentSlip));
    let grip = profile.grip.lateralGrip;
    let drag = profile.grip.drag;

    if (driftPhase === "grip") {
      const steeringDirection = reversing ? -1 : 1;
      const targetYawVelocity = steer * profile.grip.yawRate * speedRatio * steeringDirection;
      yawVelocity = lerp(
        yawVelocity,
        targetYawVelocity,
        1 - Math.exp(-profile.grip.yawResponse * dt),
      );
    } else if (driftPhase === "breakaway" || driftPhase === "sustain" || driftPhase === "transition") {
      let targetSlip = 0;
      let setImpulse = 0;
      if (driftPhase === "breakaway") {
        const hardAmount = hardDriftEntry ? 1 : hardDriftKick;
        const entryDuration = lerp(
          profile.drift.breakawayDuration,
          profile.hardDrift.entryDuration,
          hardAmount,
        );
        const setProgress = clamp(phaseTime / entryDuration, 0, 1);
        const normalDegrees = lerp(
          profile.drift.breakawayStartAngle,
          profile.drift.breakawayEndAngle,
          setProgress,
        );
        const hardDegrees = lerp(
          profile.hardDrift.startAngle,
          profile.hardDrift.endAngle,
          setProgress,
        );
        const steeringAngle = lerp(
          profile.drift.breakawaySteeringAngle,
          profile.hardDrift.steeringAngle,
          hardAmount,
        );
        const targetDegrees = lerp(normalDegrees, hardDegrees, hardAmount)
          + Math.max(0, steer * driftDirection) * steeringAngle;
        targetSlip = degToRad(-driftDirection * targetDegrees);
        const entryImpulse = lerp(
          profile.drift.breakawayImpulse,
          profile.hardDrift.entryImpulse,
          hardAmount,
        );
        setImpulse = driftDirection * entryImpulse * (1 - setProgress) * speedRatio;
        if (phaseTime >= entryDuration) {
          driftPhase = "sustain";
          hardDriftEntry = false;
          phaseTime = 0;
        }
      } else if (driftPhase === "sustain") {
        const intoDrift = steer * driftDirection;
        const holdCharge = clamp(
          (driftTime - profile.drift.sustainChargeDelay) / profile.drift.sustainChargeDuration,
          0,
          1,
        ) * profile.drift.sustainChargeAngle;
        const hardAngleKick = hardDriftKick
          * (profile.hardDrift.endAngle - profile.drift.sustainBaseAngle);
        const targetDegrees = clamp(
          profile.drift.sustainBaseAngle
            + holdCharge
            + hardAngleKick
            + Math.max(0, intoDrift) * profile.drift.sustainIntoAngle
            - Math.max(0, -intoDrift) * profile.drift.sustainCounterAngle,
          profile.drift.minimumAngle,
          profile.drift.maximumAngle,
        );
        targetSlip = degToRad(-driftDirection * targetDegrees);
        if (intoDrift < -profile.drift.transitionSteerThreshold) transitionIntentTime += dt;
        else transitionIntentTime = Math.max(0, transitionIntentTime - dt * 2);
        if (transitionIntentTime >= profile.drift.transitionIntentDuration) {
          driftPhase = "transition";
          phaseTime = 0;
          transitionIntentTime = 0;
          transitionStartSlip = currentSlip;
          bodyKick = 0.45;
        }
      } else {
        const transitionProgress = smoothstep(phaseTime / profile.drift.transitionDuration, 0, 1);
        const nextDirection = -driftDirection;
        const nextSlip = degToRad(-nextDirection * profile.drift.transitionAngle);
        targetSlip = lerp(transitionStartSlip, nextSlip, transitionProgress);
        setImpulse = nextDirection * Math.sin(transitionProgress * Math.PI)
          * profile.drift.transitionImpulse;
        if (phaseTime >= profile.drift.transitionDuration) {
          driftDirection = nextDirection;
          driftPhase = "sustain";
          phaseTime = 0;
        }
      }

      const desiredHeading = velocityHeading - targetSlip;
      const headingError = angleDifference(heading, desiredHeading);
      const assistFalloff = lerp(
        1,
        profile.drift.assistFalloff,
        clamp(
          (currentSlipDegrees - profile.drift.assistFalloffStartAngle)
            / profile.drift.assistFalloffRange,
          0,
          1,
        ),
      );
      const yawAcceleration = headingError * profile.drift.headingAssist * assistFalloff
        + steer * profile.drift.steeringYaw
        + setImpulse
        - yawVelocity * profile.drift.yawDamping;
      yawVelocity += yawAcceleration * dt;
      yawVelocity = clamp(
        yawVelocity,
        -profile.drift.maximumYawRate,
        profile.drift.maximumYawRate,
      );
      const corneringDemand = Math.max(0, steer * driftDirection);
      const hardCorneringMultiplier = lerp(1, profile.hardDrift.corneringMultiplier, hardDriftKick);
      const baseDriftGrip = lerp(
        profile.drift.lateralGrip,
        profile.hardDrift.lateralGrip,
        hardDriftKick,
      );
      grip = driftPhase === "transition"
        ? profile.drift.transitionGrip
        : baseDriftGrip + corneringDemand * profile.drift.corneringGrip * hardCorneringMultiplier;
      const usefulSlip = Math.max(0, currentSlipDegrees - profile.drift.usefulSlipAngle);
      const normalPenalty = clamp(usefulSlip / profile.drift.normalPenaltyRange, 0, 1);
      const dangerPenalty = clamp(
        (currentSlipDegrees - profile.drift.dangerSlipAngle) / profile.drift.dangerPenaltyRange,
        0,
        1,
      );
      drag = profile.drift.drag
        + normalPenalty * normalPenalty * profile.drift.normalPenalty
        + dangerPenalty * dangerPenalty * profile.drift.dangerPenalty
        + hardDriftKick * profile.hardDrift.entryDrag;
    } else {
      const headingError = angleDifference(heading, velocityHeading);
      const recoveryProgress = clamp(phaseTime / profile.recovery.duration, 0, 1);
      yawVelocity += (
        headingError * profile.recovery.headingAssist - yawVelocity * profile.recovery.yawDamping
      ) * dt;
      grip = lerp(profile.recovery.initialGrip, profile.recovery.finalGrip, recoveryProgress);
      drag = profile.recovery.drag;
      if (phaseTime >= profile.recovery.duration || Math.abs(headingError) < degToRad(2.5)) {
        const alignment = 1 - clamp(currentSlipDegrees / 14, 0, 1);
        const duration = clamp((driftTime - 0.35) / 1.35, 0, 1);
        const retention = clamp(currentSpeed / Math.max(driftEntrySpeed, 1), 0.6, 1) - 0.6;
        const roadBonus = driftStayedOnPavement ? 1 : 0.35;
        const exitQuality = alignment * (0.45 + duration * 0.55)
          * (0.65 + retention * 0.875) * roadBonus;
        if (exitQuality > 0.12 && driftTime > 0.45) {
          exitBoost = profile.exitBoost.duration;
          exitBoostForce = profile.exitBoost.baseForce + exitQuality * profile.exitBoost.qualityForce;
          exitPulse = exitQuality;
        }
        driftPhase = "grip";
        driftDirection = 0;
        driftTime = 0;
        phaseTime = 0;
        yawVelocity *= 0.35;
      }
    }

    heading = normalizeAngle(heading + yawVelocity * dt);
    if (!onPavement) {
      drag += profile.offRoad.extraDrag;
      grip = Math.max(grip, profile.offRoad.minimumGrip);
    }
    forward = direction(heading);
    const right = { x: forward.z, z: -forward.x };
    forwardSpeed = dot(velocity, forward);
    const lateralSpeed = dot(velocity, right);
    velocity.x = forward.x * forwardSpeed + right.x * lateralSpeed * Math.exp(-grip * dt);
    velocity.z = forward.z * forwardSpeed + right.z * lateralSpeed * Math.exp(-grip * dt);
    scale(velocity, Math.exp(-drag * dt));
    const movingInReverse = dot(velocity, forward) < -0.1;
    const maximumSpeed = movingInReverse
      ? profile.manual.maximumReverseSpeed
      : exitBoost > 0 ? profile.boostedMaximumSpeed : profile.maximumSpeed;
    if (length(velocity) > maximumSpeed) setLength(velocity, maximumSpeed);

    const distance = length(velocity) * dt;
    const steps = Math.max(1, Math.ceil(distance / 0.7));
    for (let index = 0; index < steps; index++) {
      addScaled(position, velocity, dt / steps);
      resolveCollisions();
    }

    const finalSpeed = length(velocity);
    const finalForwardSpeed = dot(velocity, forward);
    const finalReversing = finalForwardSpeed < -0.35;
    const finalVelocityHeading = finalSpeed > 0.4 ? Math.atan2(velocity.x, velocity.z) : heading;
    const finalMotionReference = finalReversing ? normalizeAngle(heading + Math.PI) : heading;
    visualSlip = angleDifference(finalMotionReference, finalVelocityHeading);
    const slipIntensity = clamp((Math.abs(radToDeg(visualSlip)) - 5) / 30, 0, 1)
      * clamp(finalSpeed / 10, 0, 1);
    const transitionSettle = driftPhase === "transition"
      ? Math.abs(phaseTime / profile.drift.transitionDuration - 0.5) * 2
      : 1;
    if (driftPhase !== reportedDriftPhase) {
      reportedDriftPhase = driftPhase;
      onEvent({ type: "drift-phase", phase: driftPhase });
    }
    return {
      ...snapshot(),
      dt,
      steering: steer,
      forwardSpeed: finalForwardSpeed,
      braking,
      handbrake: controls.handbrake,
      hardDriftKick,
      slipIntensity,
      distance,
      targetRoll: clamp((-steer * 0.025 + visualSlip * 0.12) * transitionSettle, -0.075, 0.075),
      targetPitch: bodyKick * 0.035 - exitPulse * 0.025,
      onPavement,
      throttle: finalReversing && reverseInput ? 1 : throttleInput,
      reversing: finalReversing,
    };
  }

  function resolveCollisions() {
    const collision = world.queryCollision(position.x, position.z, CAR_RADIUS);
    if (collision) {
      const strength = Math.min(1, length(velocity) / 18);
      if (collision.resetsCar) {
        onEvent({ type: "collision", obstacleType: collision.kind, terminal: true, strength });
        onResetRequested("collision");
        return;
      }
      position.x += collision.normalX * collision.penetration;
      position.z += collision.normalZ * collision.penetration;
      const impact = velocity.x * collision.normalX + velocity.z * collision.normalZ;
      if (impact < 0) {
        const impactStrength = Math.min(1, Math.abs(impact) / 14);
        onEvent({
          type: "collision",
          obstacleType: collision.kind,
          terminal: false,
          strength: impactStrength,
        });
        cameraShake = Math.min(0.5, cameraShake + Math.abs(impact) * 0.025);
        velocity.x -= collision.normalX * impact * 1.35;
        velocity.z -= collision.normalZ * impact * 1.35;
        scale(velocity, 0.58);
      }
    }
    if (world.isOutsideBoundary(position.x, position.z, CAR_RADIUS)) {
      const strength = Math.min(1, length(velocity) / 18);
      onEvent({ type: "collision", obstacleType: "boundary", terminal: true, strength });
      onResetRequested("boundary");
    }
  }

  function snapshot(): DrivingVehicleSnapshot {
    return {
      position: { ...position },
      velocity: { ...velocity },
      heading,
      speed: length(velocity),
      visualSlip,
      driftPhase,
      boosting: exitBoost > 0,
      cameraShake,
      exitPulse,
    };
  }

  reset();
  return {
    update,
    setControl,
    clearControls,
    setWorld(nextWorld) { world = nextWorld; },
    setControlMode(nextMode) {
      controlMode = nextMode;
      clearControls();
    },
    setDrivingProfile(nextProfile) {
      profile = nextProfile;
      controlState.setDoubleTapWindow(profile.hardDrift.doubleTapWindow);
    },
    applyExternalCollision,
    reset,
    placeAt(x, z, nextHeading) {
      reset();
      position.x = x;
      position.z = z;
      heading = nextHeading;
    },
    snapshot,
    decayCameraShake(dt) { cameraShake *= Math.exp(-9 * dt); },
  };
}

function direction(heading: number): Vec2 {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}
function dot(left: Vec2, right: Vec2) { return left.x * right.x + left.z * right.z; }
function length(vector: Vec2) { return Math.hypot(vector.x, vector.z); }
function addScaled(target: Vec2, vector: Vec2, amount: number) {
  target.x += vector.x * amount;
  target.z += vector.z * amount;
}
function scale(vector: Vec2, amount: number) {
  vector.x *= amount;
  vector.z *= amount;
}
function setLength(vector: Vec2, nextLength: number) {
  const currentLength = length(vector);
  if (currentLength > 0) scale(vector, nextLength / currentLength);
}
function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
function lerp(from: number, to: number, amount: number) { return from + (to - from) * amount; }
function smoothstep(value: number, minimum: number, maximum: number) {
  const amount = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return amount * amount * (3 - 2 * amount);
}
function degToRad(value: number) { return value * Math.PI / 180; }
function radToDeg(value: number) { return value * 180 / Math.PI; }
function normalizeAngle(angle: number) { return Math.atan2(Math.sin(angle), Math.cos(angle)); }
function angleDifference(from: number, to: number) { return normalizeAngle(to - from); }
