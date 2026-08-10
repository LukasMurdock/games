import type { DrivingWorldQuery } from "../../core/world-query";
import type { DrivingExternalCollision } from "../../simulation/types";
import { CHASE_TUNING } from "./tuning";

const TUNING = CHASE_TUNING.pursuer;

type PursuitTarget = {
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  heading: number;
  speed: number;
};

export type PursuerSimulationSnapshot = {
  position: { x: number; z: number };
  heading: number;
  speed: number;
  steering: number;
};

export type PursuerSimulationUpdate = {
  distanceToTarget: number;
  targetCollision: DrivingExternalCollision | null;
  respawned: boolean;
};

/** Presentation-free police pursuit mechanics shared by local and networked Chase. */
export function createPursuerSimulation(world: DrivingWorldQuery) {
  let position = { x: world.spawn.x, z: world.spawn.z };
  let heading = world.spawn.heading;
  let speed = 0;
  let steering = 0;
  let observedTarget = { x: position.x, z: position.z };
  let avoidanceTime = 0;
  let avoidanceHeading = heading;
  let formationSlot = 0;
  let pursuitTime = 0;
  let lowSpeedTime = 0;
  let lastCollisionEpisode = Number.NEGATIVE_INFINITY;
  const collisionEpisodes: number[] = [];

  function resetBehind(target: PursuitTarget, index = 0) {
    formationSlot = index;
    const sin = Math.sin(target.heading);
    const cos = Math.cos(target.heading);
    const formation = [
      { behind: 17, side: 0 },
      { behind: 30, side: 8 },
      { behind: 38, side: -8 },
    ][index % 3];
    const offsets = [
      formation,
      { behind: formation.behind + 5, side: -formation.side },
      { behind: formation.behind + 8, side: 12 },
      { behind: formation.behind + 8, side: -12 },
      { behind: formation.behind + 9, side: formation.side * 0.5 },
      { behind: formation.behind + 13, side: 0 },
    ];
    const placement = offsets
      .map((offset) => ({
        x: target.position.x - sin * offset.behind + cos * offset.side,
        z: target.position.z - cos * offset.behind - sin * offset.side,
      }))
      .find((candidate) => (
        world.isOnPavement(candidate.x, candidate.z)
        && !world.queryCollision(candidate.x, candidate.z, TUNING.radius)
        && !world.isOutsideBoundary(candidate.x, candidate.z, TUNING.radius)
      ));
    if (!placement) return false;
    position = placement;
    heading = target.heading;
    speed = Math.min(target.speed * 0.55, 12);
    steering = 0;
    avoidanceTime = 0;
    avoidanceHeading = heading;
    lowSpeedTime = 0;
    collisionEpisodes.length = 0;
    lastCollisionEpisode = Number.NEGATIVE_INFINITY;
    observedTarget = { ...target.position };
    return true;
  }

  function update(dt: number, target: PursuitTarget, accuracy: number): PursuerSimulationUpdate {
    pursuitTime += dt;
    const initialDistance = distance(position, target.position);
    const predictionAmount = smoothstep(initialDistance, 8, 30);
    const predictionTime = lerp(TUNING.predictionTime, CHASE_TUNING.accuracyRamp.predictionTime, accuracy);
    const reactionRate = lerp(TUNING.targetReactionRate, CHASE_TUNING.accuracyRamp.targetReactionRate, accuracy);
    const desiredTarget = {
      x: target.position.x + target.velocity.x * predictionTime * predictionAmount,
      z: target.position.z + target.velocity.z * predictionTime * predictionAmount,
    };
    const reaction = 1 - Math.exp(-reactionRate * dt);
    observedTarget.x = lerp(observedTarget.x, desiredTarget.x, reaction);
    observedTarget.z = lerp(observedTarget.z, desiredTarget.z, reaction);
    const targetHeading = Math.atan2(observedTarget.x - position.x, observedTarget.z - position.z);

    avoidanceTime = Math.max(0, avoidanceTime - dt);
    if (avoidanceTime <= 0 && speed > 5) {
      for (const lookAhead of [4, 7, 10]) {
        const candidate = {
          x: position.x + Math.sin(heading) * lookAhead,
          z: position.z + Math.cos(heading) * lookAhead,
        };
        const collision = world.queryCollision(candidate.x, candidate.z, TUNING.radius);
        if (!collision) continue;
        const tangentA = Math.atan2(collision.normalZ, -collision.normalX);
        const tangentB = normalizeAngle(tangentA + Math.PI);
        avoidanceHeading = Math.abs(angleDifference(tangentA, targetHeading))
          < Math.abs(angleDifference(tangentB, targetHeading)) ? tangentA : tangentB;
        avoidanceTime = 0.38;
        break;
      }
    }

    const requestedHeading = avoidanceTime > 0 ? avoidanceHeading : targetHeading;
    const headingError = angleDifference(heading, requestedHeading);
    const speedRatio = clamp(speed / TUNING.maximumSpeed, 0, 1);
    const lowTurn = lerp(TUNING.lowSpeedTurnRate, CHASE_TUNING.accuracyRamp.lowSpeedTurnRate, accuracy);
    const highTurn = lerp(TUNING.highSpeedTurnRate, CHASE_TUNING.accuracyRamp.highSpeedTurnRate, accuracy);
    const closeFloor = lerp(0.45, CHASE_TUNING.accuracyRamp.closeRangeSteeringFloor, accuracy);
    const turnRate = lerp(lowTurn, highTurn, speedRatio)
      * lerp(closeFloor, 1, smoothstep(initialDistance, 5, 16));
    heading = normalizeAngle(heading + clamp(headingError, -turnRate * dt, turnRate * dt));

    const maximumSpeed = world.isOnPavement(position.x, position.z)
      ? TUNING.maximumSpeed : TUNING.offRoadMaximumSpeed;
    const catchUp = smoothstep(initialDistance, 14, 45) * TUNING.maximumCatchUpSpeed;
    let requestedSpeed = Math.max(14, target.speed + catchUp);
    if (initialDistance < 10) requestedSpeed = Math.max(11, target.speed + TUNING.closeRangeSpeedAdvantage);
    const targetSpeed = Math.min(maximumSpeed, requestedSpeed);
    const speedChange = (targetSpeed > speed ? TUNING.acceleration : TUNING.deceleration) * dt;
    speed += clamp(targetSpeed - speed, -speedChange, speedChange);

    const travel = speed * dt;
    const steps = Math.max(1, Math.ceil(travel / 0.65));
    let worldCollision = false;
    for (let step = 0; step < steps; step++) {
      position.x += Math.sin(heading) * travel / steps;
      position.z += Math.cos(heading) * travel / steps;
      const collision = world.queryCollision(position.x, position.z, TUNING.radius);
      if (!collision) continue;
      worldCollision = true;
      position.x += collision.normalX * collision.penetration;
      position.z += collision.normalZ * collision.penetration;
      const tangentA = Math.atan2(collision.normalZ, -collision.normalX);
      const tangentB = normalizeAngle(tangentA + Math.PI);
      avoidanceHeading = Math.abs(angleDifference(tangentA, targetHeading))
        < Math.abs(angleDifference(tangentB, targetHeading)) ? tangentA : tangentB;
      avoidanceTime = 0.72;
      heading = normalizeAngle(heading + clamp(angleDifference(heading, avoidanceHeading), -0.42, 0.42));
      speed *= 0.48;
    }

    if (worldCollision && pursuitTime - lastCollisionEpisode >= TUNING.collisionEpisodeCooldown) {
      lastCollisionEpisode = pursuitTime;
      collisionEpisodes.push(pursuitTime);
    }
    while (collisionEpisodes.length && pursuitTime - collisionEpisodes[0] > TUNING.collisionBurstWindow) {
      collisionEpisodes.shift();
    }
    const resolvedDistance = distance(position, target.position);
    lowSpeedTime = speed < TUNING.stuckSpeed && resolvedDistance > TUNING.stuckDistance
      ? lowSpeedTime + dt : 0;
    const stuck = resolvedDistance > TUNING.stuckDistance
      && (lowSpeedTime >= TUNING.stuckDuration || collisionEpisodes.length >= TUNING.collisionBurstCount);
    const needsRespawn = world.isOutsideBoundary(position.x, position.z, TUNING.radius) || stuck;
    if (needsRespawn && resetBehind(target, formationSlot)) {
      return { distanceToTarget: distance(position, target.position), targetCollision: null, respawned: true };
    }
    if (needsRespawn) {
      lowSpeedTime = 0;
      collisionEpisodes.length = 0;
    }

    const targetCollision = queryCollision(target, { position, heading });
    if (targetCollision) {
      const pursuerVelocity = { x: Math.sin(heading) * speed, z: Math.cos(heading) * speed };
      const relative = {
        x: target.velocity.x - pursuerVelocity.x,
        z: target.velocity.z - pursuerVelocity.z,
      };
      const closingSpeed = Math.max(0, -(relative.x * targetCollision.normalX + relative.z * targetCollision.normalZ));
      position.x -= targetCollision.normalX * targetCollision.penetration * 0.55;
      position.z -= targetCollision.normalZ * targetCollision.penetration * 0.55;
      speed *= lerp(0.82, 0.52, clamp(closingSpeed / 14, 0, 1));
      steering = lerp(steering, clamp(headingError * 0.7, -0.5, 0.5), 1 - Math.exp(-10 * dt));
      return {
        distanceToTarget: distance(position, target.position),
        targetCollision: {
          normalX: targetCollision.normalX,
          normalZ: targetCollision.normalZ,
          penetration: targetCollision.penetration * 0.45,
          closingSpeed,
        },
        respawned: false,
      };
    }
    steering = lerp(steering, clamp(headingError * 0.7, -0.5, 0.5), 1 - Math.exp(-10 * dt));
    return { distanceToTarget: distance(position, target.position), targetCollision: null, respawned: false };
  }

  return {
    resetBehind,
    update,
    snapshot: (): PursuerSimulationSnapshot => ({ position: { ...position }, heading, speed, steering }),
  };
}

function queryCollision(first: PursuitTarget, second: { position: { x: number; z: number }; heading: number }) {
  const offset = 1.05;
  const radius = 1.02;
  let deepest: { normalX: number; normalZ: number; penetration: number } | null = null;
  for (const firstOffset of [-offset, offset]) {
    const firstX = first.position.x + Math.sin(first.heading) * firstOffset;
    const firstZ = first.position.z + Math.cos(first.heading) * firstOffset;
    for (const secondOffset of [-offset, offset]) {
      let dx = firstX - (second.position.x + Math.sin(second.heading) * secondOffset);
      let dz = firstZ - (second.position.z + Math.cos(second.heading) * secondOffset);
      let distanceSquared = dx * dx + dz * dz;
      const minimum = radius * 2;
      if (distanceSquared >= minimum * minimum) continue;
      if (distanceSquared < 0.000001) { dx = Math.cos(first.heading); dz = -Math.sin(first.heading); distanceSquared = 1; }
      const separation = Math.sqrt(distanceSquared);
      const collision = { normalX: dx / separation, normalZ: dz / separation, penetration: minimum - separation };
      if (!deepest || collision.penetration > deepest.penetration) deepest = collision;
    }
  }
  return deepest;
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }) { return Math.hypot(a.x - b.x, a.z - b.z); }
function smoothstep(value: number, start: number, end: number) { const t = clamp((value - start) / Math.max(end - start, 0.001), 0, 1); return t * t * (3 - 2 * t); }
function angleDifference(from: number, to: number) { return normalizeAngle(to - from); }
function normalizeAngle(value: number) { return Math.atan2(Math.sin(value), Math.cos(value)); }
function lerp(a: number, b: number, amount: number) { return a + (b - a) * amount; }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
