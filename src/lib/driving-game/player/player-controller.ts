import * as THREE from "three";
import { createDrivingControlState } from "../core/controls";
import {
  createDrivingWorldQuery,
  type DrivingWorldQuery,
} from "../core/world-query";
import type { DrivingProfile } from "../driving-profiles";
import type { ControlMode, DriftPhase, DriveEndReason } from "../types";
import type { WorldRuntime } from "../world/types";
import type {
  PlayerControlName,
  PlayerController,
  PlayerEvent,
  PlayerExternalCollision,
  PlayerSnapshot,
} from "./types";
import {
  createNullPlayerPresentation,
  createPlayerPresentation,
  type PlayerPresentation,
} from "./player-presentation";

const CAR_RADIUS = 1.25;

export function createPlayerController({
  scene,
  presentation: suppliedPresentation,
  world: initialWorld,
  worldQuery: suppliedWorldQuery,
  profile,
  controlMode: initialControlMode,
  onEvent,
  onResetRequested,
}: {
  scene?: THREE.Scene;
  presentation?: PlayerPresentation;
  world?: WorldRuntime;
  worldQuery?: DrivingWorldQuery;
  profile: DrivingProfile;
  controlMode: ControlMode;
  onEvent: (event: PlayerEvent) => void;
  onResetRequested: (reason: DriveEndReason) => void;
}): PlayerController {
  if (!initialWorld && !suppliedWorldQuery) {
    throw new Error("PlayerController requires a world or DrivingWorldQuery.");
  }
  let worldQuery = suppliedWorldQuery ?? createDrivingWorldQuery(initialWorld as WorldRuntime);
  let DRIVING = profile;
  let controlMode = initialControlMode;
  const presentation = suppliedPresentation
    ?? (scene ? createPlayerPresentation(scene, profile) : createNullPlayerPresentation());
  const position = new THREE.Vector3(worldQuery.spawn.x, 0.06, worldQuery.spawn.z);
  const velocity = new THREE.Vector3();
  let heading = worldQuery.spawn.heading;
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
  // Snapshot vectors are detached from simulation state so consumers cannot move the player accidentally.
  const snapshot: PlayerSnapshot = {
    position: position.clone(),
    velocity: velocity.clone(),
    heading,
    speed: 0,
    visualSlip,
    driftPhase,
    boosting: false,
    cameraShake,
    exitPulse,
  };

  const controlState = createDrivingControlState(DRIVING.hardDrift.doubleTapWindow);
  const controls = controlState.pressed;

  function setControl(name: PlayerControlName, pressed: boolean) {
    const tapDirection = name === "left" ? 1 : name === "right" ? -1 : 0;
    if (pressed && tapDirection !== 0 && hardDriftReentryTime > 0 && tapDirection !== hardDriftReentryDirection) {
      hardDriftReentryTime = 0;
      hardDriftReentryDirection = 0;
    }
    if (controlState.set(name, pressed).hardDriftDoubleTap) {
      hardDriftInputBuffer = DRIVING.hardDrift.inputBuffer;
    }
  }

  function clearControls() {
    controlState.clear();
    hardDriftInputBuffer = 0;
    hardDriftReentryTime = 0;
    hardDriftReentryDirection = 0;
  }

  function applyExternalCollision(collision: PlayerExternalCollision) {
    position.x += collision.normalX * collision.penetration;
    position.z += collision.normalZ * collision.penetration;
    const impactStrength = THREE.MathUtils.clamp(collision.closingSpeed / 14, 0, 1);
    if (collision.closingSpeed > 0) {
      const impulse = Math.min(collision.closingSpeed, 14) * 0.48;
      velocity.x += collision.normalX * impulse;
      velocity.z += collision.normalZ * impulse;
      velocity.multiplyScalar(THREE.MathUtils.lerp(0.98, 0.88, impactStrength));
      cameraShake = Math.min(0.5, cameraShake + impactStrength * 0.22);
      if (collision.closingSpeed > 2) presentation.impact(impactStrength);
      onEvent({
        type: "collision",
        obstacleType: "vehicle",
        terminal: false,
        strength: impactStrength,
      });
    }
    presentation.syncPosition(position);
  }

  function reset() {
    position.set(worldQuery.spawn.x, 0.06, worldQuery.spawn.z);
    velocity.set(0, 0, 0);
    heading = worldQuery.spawn.heading;
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
    presentation.reset(position, heading);
  }

  function update(dt: number) {
    controlState.advance(dt);
    let forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    let forwardSpeed = velocity.dot(forward);
    const speed = velocity.length();
    const steer = Number(controls.left) - Number(controls.right);
    const handbrakePressed = controls.handbrake && !previousHandbrake;
    const throttleInput = controlMode === "automatic" ? 1 : Number(controls.accelerate);
    const reverseInput = controlMode === "manual" && controls.brake;
    let braking = false;
    let reversing = forwardSpeed < -0.35;
    const onPavement = worldQuery.isOnPavement(position.x, position.z);

    // A short buffer makes pressing Drift just before steering feel intentional rather than missed.
    if (handbrakePressed) driftInputBuffer = DRIVING.inputBuffer;
    else driftInputBuffer = Math.max(0, driftInputBuffer - dt);
    hardDriftInputBuffer = Math.max(0, hardDriftInputBuffer - dt);
    hardDriftReentryTime = Math.max(0, hardDriftReentryTime - dt);
    if (hardDriftReentryTime === 0) hardDriftReentryDirection = 0;
    previousHandbrake = controls.handbrake;

    const hardDirection = Math.sign(steer);
    const wantsHardReentry = handbrakePressed
      && hardDriftReentryTime > 0
      && forwardSpeed > DRIVING.hardDrift.minimumSpeed
      && (hardDirection === 0 || hardDirection === hardDriftReentryDirection);
    const hardTriggerDirection = wantsHardReentry ? hardDriftReentryDirection : hardDirection;
    if (wantsHardReentry && hardDriftEntry) {
      hardDriftReentryTime = 0;
      hardDriftReentryDirection = 0;
    }
    const canDirectionalHardDrift = hardDriftInputBuffer > 0
      && forwardSpeed > DRIVING.hardDrift.minimumSpeed
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
      velocity.multiplyScalar(DRIVING.hardDrift.initialSpeedRetention);
      bodyKick = 1.25;
      cameraShake = Math.max(cameraShake, 0.11);
      driftInputBuffer = 0;

      if (wantsHardReentry || controls.handbrake) {
        hardDriftReentryTime = 0;
        hardDriftReentryDirection = 0;
      } else {
        hardDriftReentryTime = DRIVING.hardDrift.reentryWindow;
        hardDriftReentryDirection = hardTriggerDirection;
      }
    }

    const canBreakAway = forwardSpeed > DRIVING.drift.minimumSpeed && Math.abs(steer) > 0.16;
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

    // Releasing Drift always means hook-up. This keeps the mechanic predictable.
    if (!hardDriftEntry && driftPhase !== "grip" && driftPhase !== "recover" && !controls.handbrake) {
      driftPhase = "recover";
      hardDriftEntry = false;
      phaseTime = 0;
      transitionIntentTime = 0;
    }

    if (!hardDriftEntry) {
      hardDriftKick = Math.max(0, hardDriftKick - dt / DRIVING.hardDrift.kickDecay);
    }
    phaseTime += dt;
    if (driftPhase === "breakaway" || driftPhase === "sustain" || driftPhase === "transition") driftTime += dt;
    if (driftPhase !== "grip") driftStayedOnPavement &&= onPavement;

    if (controlMode === "automatic") {
      velocity.addScaledVector(forward, DRIVING.acceleration * dt);
    } else {
      const opposingDirections = (throttleInput > 0 && reverseInput)
        || (throttleInput > 0 && forwardSpeed < -0.35)
        || (reverseInput && forwardSpeed > 0.35);
      const sidewaysMotion = Math.abs(forwardSpeed) <= 0.35 && speed > 0.5;
      if (opposingDirections || sidewaysMotion) {
        braking = true;
        const nextSpeed = Math.max(0, speed - DRIVING.manual.brakeDeceleration * dt);
        if (speed > 0.0001) velocity.multiplyScalar(nextSpeed / speed);
      } else if (throttleInput > 0) {
        velocity.addScaledVector(forward, DRIVING.acceleration * dt);
      } else if (reverseInput && driftPhase === "grip") {
        velocity.addScaledVector(forward, -DRIVING.manual.reverseAcceleration * dt);
        reversing = true;
      }
    }
    if (exitBoost > 0) {
      const boostEnvelope = Math.sin((exitBoost / DRIVING.exitBoost.duration) * Math.PI);
      velocity.addScaledVector(forward, exitBoostForce * boostEnvelope * throttleInput * dt);
      exitBoost = Math.max(0, exitBoost - dt);
    }
    exitPulse = Math.max(0, exitPulse - dt * 2.3);
    bodyKick = Math.max(0, bodyKick - dt * 5.5);

    forwardSpeed = velocity.dot(forward);
    const currentSpeed = velocity.length();
    const minimumSteeringSpeed = controlMode === "automatic" ? 0.12 : 0;
    const speedRatio = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / 12, minimumSteeringSpeed, 1);
    reversing = forwardSpeed < -0.35;
    const velocityHeading = currentSpeed > 0.4 ? Math.atan2(velocity.x, velocity.z) : heading;
    const motionReferenceHeading = reversing ? normalizeAngle(heading + Math.PI) : heading;
    const currentSlip = angleDifference(motionReferenceHeading, velocityHeading);
    const currentSlipDegrees = Math.abs(THREE.MathUtils.radToDeg(currentSlip));
    let grip = DRIVING.grip.lateralGrip;
    let drag = DRIVING.grip.drag;

    if (driftPhase === "grip") {
      // Grip steering is deliberately wider at speed; drifting is the tool for tight corners.
      const steeringDirection = reversing ? -1 : 1;
      const targetYawVelocity = steer * DRIVING.grip.yawRate * speedRatio * steeringDirection;
      yawVelocity = THREE.MathUtils.lerp(
        yawVelocity,
        targetYawVelocity,
        1 - Math.exp(-DRIVING.grip.yawResponse * dt),
      );
    } else if (driftPhase === "breakaway" || driftPhase === "sustain" || driftPhase === "transition") {
      let targetSlip = 0;
      let setImpulse = 0;

      if (driftPhase === "breakaway") {
        const hardAmount = hardDriftEntry ? 1 : hardDriftKick;
        const entryDuration = THREE.MathUtils.lerp(
          DRIVING.drift.breakawayDuration,
          DRIVING.hardDrift.entryDuration,
          hardAmount,
        );
        const setProgress = THREE.MathUtils.clamp(phaseTime / entryDuration, 0, 1);
        const normalDegrees = THREE.MathUtils.lerp(
          DRIVING.drift.breakawayStartAngle,
          DRIVING.drift.breakawayEndAngle,
          setProgress,
        );
        const hardDegrees = THREE.MathUtils.lerp(
          DRIVING.hardDrift.startAngle,
          DRIVING.hardDrift.endAngle,
          setProgress,
        );
        const steeringAngle = THREE.MathUtils.lerp(
          DRIVING.drift.breakawaySteeringAngle,
          DRIVING.hardDrift.steeringAngle,
          hardAmount,
        );
        const targetDegrees = THREE.MathUtils.lerp(normalDegrees, hardDegrees, hardAmount)
          + Math.max(0, steer * driftDirection) * steeringAngle;
        targetSlip = THREE.MathUtils.degToRad(-driftDirection * targetDegrees);
        const entryImpulse = THREE.MathUtils.lerp(
          DRIVING.drift.breakawayImpulse,
          DRIVING.hardDrift.entryImpulse,
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
        const holdCharge = THREE.MathUtils.clamp(
          (driftTime - DRIVING.drift.sustainChargeDelay) / DRIVING.drift.sustainChargeDuration,
          0,
          1,
        ) * DRIVING.drift.sustainChargeAngle;
        const hardAngleKick = hardDriftKick
          * (DRIVING.hardDrift.endAngle - DRIVING.drift.sustainBaseAngle);
        const targetDegrees = THREE.MathUtils.clamp(
          DRIVING.drift.sustainBaseAngle
            + holdCharge
            + hardAngleKick
            + Math.max(0, intoDrift) * DRIVING.drift.sustainIntoAngle
            - Math.max(0, -intoDrift) * DRIVING.drift.sustainCounterAngle,
          DRIVING.drift.minimumAngle,
          DRIVING.drift.maximumAngle,
        );
        targetSlip = THREE.MathUtils.degToRad(-driftDirection * targetDegrees);

        if (intoDrift < -DRIVING.drift.transitionSteerThreshold) transitionIntentTime += dt;
        else transitionIntentTime = Math.max(0, transitionIntentTime - dt * 2);
        if (transitionIntentTime >= DRIVING.drift.transitionIntentDuration) {
          driftPhase = "transition";
          phaseTime = 0;
          transitionIntentTime = 0;
          transitionStartSlip = currentSlip;
          bodyKick = 0.45;
        }
      } else {
        const transitionProgress = THREE.MathUtils.smoothstep(
          phaseTime / DRIVING.drift.transitionDuration,
          0,
          1,
        );
        const nextDirection = -driftDirection;
        const nextSlip = THREE.MathUtils.degToRad(-nextDirection * DRIVING.drift.transitionAngle);
        targetSlip = THREE.MathUtils.lerp(transitionStartSlip, nextSlip, transitionProgress);
        setImpulse = nextDirection * Math.sin(transitionProgress * Math.PI) * DRIVING.drift.transitionImpulse;
        if (phaseTime >= DRIVING.drift.transitionDuration) {
          driftDirection = nextDirection;
          driftPhase = "sustain";
          phaseTime = 0;
        }
      }

      const desiredHeading = velocityHeading - targetSlip;
      const headingError = angleDifference(heading, desiredHeading);
      const assistFalloff = THREE.MathUtils.lerp(
        1,
        DRIVING.drift.assistFalloff,
        THREE.MathUtils.clamp(
          (currentSlipDegrees - DRIVING.drift.assistFalloffStartAngle) / DRIVING.drift.assistFalloffRange,
          0,
          1,
        ),
      );
      const yawAcceleration = headingError * DRIVING.drift.headingAssist * assistFalloff
        + steer * DRIVING.drift.steeringYaw
        + setImpulse
        - yawVelocity * DRIVING.drift.yawDamping;
      yawVelocity += yawAcceleration * dt;
      yawVelocity = THREE.MathUtils.clamp(
        yawVelocity,
        -DRIVING.drift.maximumYawRate,
        DRIVING.drift.maximumYawRate,
      );
      const corneringDemand = Math.max(0, steer * driftDirection);
      const hardCorneringMultiplier = THREE.MathUtils.lerp(
        1,
        DRIVING.hardDrift.corneringMultiplier,
        hardDriftKick,
      );
      const baseDriftGrip = THREE.MathUtils.lerp(
        DRIVING.drift.lateralGrip,
        DRIVING.hardDrift.lateralGrip,
        hardDriftKick,
      );
      grip = driftPhase === "transition"
        ? DRIVING.drift.transitionGrip
        : baseDriftGrip
          + corneringDemand * DRIVING.drift.corneringGrip * hardCorneringMultiplier;

      // Shallow drifts preserve speed. Big, spectacular angles remain possible but cost momentum.
      const usefulSlip = Math.max(0, currentSlipDegrees - DRIVING.drift.usefulSlipAngle);
      const normalPenalty = THREE.MathUtils.clamp(usefulSlip / DRIVING.drift.normalPenaltyRange, 0, 1);
      const dangerPenalty = THREE.MathUtils.clamp(
        (currentSlipDegrees - DRIVING.drift.dangerSlipAngle) / DRIVING.drift.dangerPenaltyRange,
        0,
        1,
      );
      drag = DRIVING.drift.drag
        + normalPenalty * normalPenalty * DRIVING.drift.normalPenalty
        + dangerPenalty * dangerPenalty * DRIVING.drift.dangerPenalty
        + hardDriftKick * DRIVING.hardDrift.entryDrag;
    } else {
      // Hook-up progressively aligns the body and velocity rather than snapping either one.
      const headingError = angleDifference(heading, velocityHeading);
      const recoveryProgress = THREE.MathUtils.clamp(phaseTime / DRIVING.recovery.duration, 0, 1);
      yawVelocity += (
        headingError * DRIVING.recovery.headingAssist
        - yawVelocity * DRIVING.recovery.yawDamping
      ) * dt;
      grip = THREE.MathUtils.lerp(
        DRIVING.recovery.initialGrip,
        DRIVING.recovery.finalGrip,
        recoveryProgress,
      );
      drag = DRIVING.recovery.drag;

      if (phaseTime >= DRIVING.recovery.duration || Math.abs(headingError) < THREE.MathUtils.degToRad(2.5)) {
        const alignment = 1 - THREE.MathUtils.clamp(currentSlipDegrees / 14, 0, 1);
        const duration = THREE.MathUtils.clamp((driftTime - 0.35) / 1.35, 0, 1);
        const retention = THREE.MathUtils.clamp(currentSpeed / Math.max(driftEntrySpeed, 1), 0.6, 1) - 0.6;
        const roadBonus = driftStayedOnPavement ? 1 : 0.35;
        const exitQuality = alignment * (0.45 + duration * 0.55) * (0.65 + retention * 0.875) * roadBonus;
        if (exitQuality > 0.12 && driftTime > 0.45) {
          exitBoost = DRIVING.exitBoost.duration;
          exitBoostForce = DRIVING.exitBoost.baseForce + exitQuality * DRIVING.exitBoost.qualityForce;
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
      drag += DRIVING.offRoad.extraDrag;
      grip = Math.max(grip, DRIVING.offRoad.minimumGrip);
    }

    forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    forwardSpeed = velocity.dot(forward);
    const lateralSpeed = velocity.dot(right);
    velocity.copy(forward.clone().multiplyScalar(forwardSpeed)).add(right.multiplyScalar(lateralSpeed * Math.exp(-grip * dt)));
    velocity.multiplyScalar(Math.exp(-drag * dt));
    const movingInReverse = velocity.dot(forward) < -0.1;
    const maximumSpeed = movingInReverse
      ? DRIVING.manual.maximumReverseSpeed
      : exitBoost > 0
        ? DRIVING.boostedMaximumSpeed
        : DRIVING.maximumSpeed;
    if (velocity.length() > maximumSpeed) velocity.setLength(maximumSpeed);

    const distance = velocity.length() * dt;
    const steps = Math.max(1, Math.ceil(distance / 0.7));
    for (let i = 0; i < steps; i++) {
      position.addScaledVector(velocity, dt / steps);
      resolveCollisions();
    }

    const finalSpeed = velocity.length();
    const finalForwardSpeed = velocity.dot(forward);
    const finalReversing = finalForwardSpeed < -0.35;
    const finalVelocityHeading = finalSpeed > 0.4 ? Math.atan2(velocity.x, velocity.z) : heading;
    const finalMotionReference = finalReversing ? normalizeAngle(heading + Math.PI) : heading;
    visualSlip = angleDifference(finalMotionReference, finalVelocityHeading);
    const slipIntensity = THREE.MathUtils.clamp((Math.abs(THREE.MathUtils.radToDeg(visualSlip)) - 5) / 30, 0, 1)
      * THREE.MathUtils.clamp(finalSpeed / 10, 0, 1);

    const transitionSettle = driftPhase === "transition"
      ? Math.abs(phaseTime / DRIVING.drift.transitionDuration - 0.5) * 2
      : 1;
    presentation.update({
      dt,
      position,
      heading,
      steering: steer,
      forwardSpeed: finalForwardSpeed,
      braking,
      handbrake: controls.handbrake,
      hardDriftKick,
      visualSlip,
      slipIntensity,
      speed: finalSpeed,
      distance,
      targetRoll: THREE.MathUtils.clamp(
        (-steer * 0.025 + visualSlip * 0.12) * transitionSettle,
        -0.075,
        0.075,
      ),
      targetPitch: bodyKick * 0.035 - exitPulse * 0.025,
      phase: driftPhase,
      onPavement,
      boosting: exitBoost > 0,
      throttle: finalReversing && reverseInput ? 1 : throttleInput,
      reversing: finalReversing,
    });
    if (driftPhase !== reportedDriftPhase) {
      reportedDriftPhase = driftPhase;
      onEvent({ type: "drift-phase", phase: driftPhase });
    }
  }

  function resolveCollisions() {
    const collision = worldQuery.queryCollision(position.x, position.z, CAR_RADIUS);
    if (collision) {
      const strength = Math.min(1, velocity.length() / 18);
      if (collision.resetsCar) {
        presentation.impact(strength);
        onEvent({ type: "collision", obstacleType: collision.kind, terminal: true, strength });
        onResetRequested("collision");
        return;
      }

      position.x += collision.normalX * collision.penetration;
      position.z += collision.normalZ * collision.penetration;
      const impact = velocity.x * collision.normalX + velocity.z * collision.normalZ;
      if (impact < 0) {
        const impactStrength = Math.min(1, Math.abs(impact) / 14);
        if (Math.abs(impact) > 3) presentation.impact(impactStrength);
        onEvent({
          type: "collision",
          obstacleType: collision.kind,
          terminal: false,
          strength: impactStrength,
        });
        cameraShake = Math.min(0.5, cameraShake + Math.abs(impact) * 0.025);
        velocity.x -= collision.normalX * impact * 1.35;
        velocity.z -= collision.normalZ * impact * 1.35;
        velocity.multiplyScalar(0.58);
      }
    }

    if (worldQuery.isOutsideBoundary(position.x, position.z, CAR_RADIUS)) {
      const strength = Math.min(1, velocity.length() / 18);
      presentation.impact(strength);
      onEvent({ type: "collision", obstacleType: "boundary", terminal: true, strength });
      onResetRequested("boundary");
    }
  }


  function getSnapshot(): PlayerSnapshot {
    snapshot.position.copy(position);
    snapshot.velocity.copy(velocity);
    snapshot.heading = heading;
    snapshot.speed = velocity.length();
    snapshot.visualSlip = visualSlip;
    snapshot.driftPhase = driftPhase;
    snapshot.boosting = exitBoost > 0;
    snapshot.cameraShake = cameraShake;
    snapshot.exitPulse = exitPulse;
    return snapshot;
  }

  reset();

  return {
    start() {
      presentation.start();
    },
    update,
    setWorld(nextWorld) {
      worldQuery = createDrivingWorldQuery(nextWorld);
    },
    setControlMode(nextMode) {
      controlMode = nextMode;
      clearControls();
    },
    setDrivingProfile(nextProfile) {
      DRIVING = nextProfile;
      controlState.setDoubleTapWindow(DRIVING.hardDrift.doubleTapWindow);
      presentation.setProfile(nextProfile);
    },
    setControl,
    clearControls,
    applyExternalCollision,
    reset,
    placeAt(x, z, nextHeading) {
      reset();
      position.set(x, 0.06, z);
      heading = nextHeading;
      presentation.reset(position, heading);
    },
    setPaused(paused) {
      presentation.setPaused(paused);
    },
    getSnapshot,
    decayCameraShake(dt) {
      cameraShake *= Math.exp(-9 * dt);
    },
    destroy() {
      presentation.destroy();
    },
  };
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function angleDifference(from: number, to: number) {
  return normalizeAngle(to - from);
}
