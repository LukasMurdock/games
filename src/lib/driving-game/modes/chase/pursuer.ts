import * as THREE from "three";
import type { PlayerExternalCollision, PlayerSnapshot } from "../../player";
import { createCar } from "../../vehicle/create-car";
import { queryVehicleCollision } from "../../vehicle/collision";
import type { WorldRuntime } from "../../world/types";
import { CHASE_TUNING } from "./tuning";

const { pursuer: PURSUER_TUNING } = CHASE_TUNING;

export type PursuerUpdate = {
  distanceToPlayer: number;
  playerCollision: PlayerExternalCollision | null;
  respawned: boolean;
};

export type Pursuer = {
  setVisible: (visible: boolean) => void;
  resetBehind: (player: PlayerSnapshot, formationIndex?: number) => boolean;
  update: (dt: number, player: PlayerSnapshot, accuracy: number) => PursuerUpdate;
  destroy: () => void;
};

export function createPursuer(scene: THREE.Scene, world: WorldRuntime): Pursuer {
  const car = createCar({ police: true });
  scene.add(car.group);

  const position = world.spawnPosition.clone();
  const target = new THREE.Vector3();
  const observedTarget = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const candidate = new THREE.Vector3();
  let heading = world.spawnHeading;
  let speed = 0;
  let steeringVisual = 0;
  let sirenTime = 0;
  let avoidanceTime = 0;
  let avoidanceHeading = heading;
  let formationSlot = 0;
  let pursuitTime = 0;
  let lowSpeedTime = 0;
  let lastCollisionEpisode = Number.NEGATIVE_INFINITY;
  const collisionEpisodes: number[] = [];

  function placeCar() {
    car.group.position.copy(position);
    car.group.rotation.y = heading;
  }

  function resetBehind(player: PlayerSnapshot, formationIndex = 0) {
    formationSlot = formationIndex;
    const sin = Math.sin(player.heading);
    const cos = Math.cos(player.heading);
    const formation = [
      { behind: 17, side: 0 },
      { behind: 30, side: 8 },
      { behind: 38, side: -8 },
    ][formationIndex % 3];
    const candidates = [
      formation,
      { behind: formation.behind + 5, side: -formation.side },
      { behind: formation.behind + 8, side: 12 },
      { behind: formation.behind + 8, side: -12 },
      { behind: formation.behind + 9, side: formation.side * 0.5 },
      { behind: formation.behind + 13, side: 0 },
    ];
    const placementCandidates = candidates.map((offset) => new THREE.Vector3(
      player.position.x - sin * offset.behind + cos * offset.side,
      0.06,
      player.position.z - cos * offset.behind - sin * offset.side,
    ));
    const placement = world.findSafePlacement(placementCandidates, PURSUER_TUNING.radius);
    if (!placement) return false;
    position.copy(placement);

    heading = player.heading;
    speed = Math.min(player.speed * 0.55, 12);
    steeringVisual = 0;
    avoidanceTime = 0;
    avoidanceHeading = heading;
    lowSpeedTime = 0;
    collisionEpisodes.length = 0;
    lastCollisionEpisode = Number.NEGATIVE_INFINITY;
    observedTarget.copy(player.position);
    placeCar();
    return true;
  }

  function update(dt: number, player: PlayerSnapshot, accuracy: number) {
    pursuitTime += dt;
    const distanceToPlayer = horizontalDistance(position, player.position);
    const predictionAmount = THREE.MathUtils.smoothstep(distanceToPlayer, 8, 30);
    const predictionTime = THREE.MathUtils.lerp(
      PURSUER_TUNING.predictionTime,
      CHASE_TUNING.accuracyRamp.predictionTime,
      accuracy,
    );
    const targetReactionRate = THREE.MathUtils.lerp(
      PURSUER_TUNING.targetReactionRate,
      CHASE_TUNING.accuracyRamp.targetReactionRate,
      accuracy,
    );
    target.copy(player.position).addScaledVector(
      player.velocity,
      predictionTime * predictionAmount,
    );
    observedTarget.lerp(target, 1 - Math.exp(-targetReactionRate * dt));
    const targetHeading = Math.atan2(observedTarget.x - position.x, observedTarget.z - position.z);
    avoidanceTime = Math.max(0, avoidanceTime - dt);
    if (avoidanceTime <= 0 && speed > 5) {
      for (const lookAhead of [4, 7, 10]) {
        candidate.set(
          position.x + Math.sin(heading) * lookAhead,
          0.06,
          position.z + Math.cos(heading) * lookAhead,
        );
        const predictedCollision = world.queryCollision(candidate, PURSUER_TUNING.radius);
        if (!predictedCollision) continue;
        const tangentA = Math.atan2(predictedCollision.normalZ, -predictedCollision.normalX);
        const tangentB = normalizeAngle(tangentA + Math.PI);
        avoidanceHeading = Math.abs(angleDifference(tangentA, targetHeading))
            < Math.abs(angleDifference(tangentB, targetHeading))
          ? tangentA
          : tangentB;
        avoidanceTime = 0.38;
        break;
      }
    }
    const requestedHeading = avoidanceTime > 0 ? avoidanceHeading : targetHeading;
    const headingError = angleDifference(heading, requestedHeading);
    const speedRatio = THREE.MathUtils.clamp(speed / PURSUER_TUNING.maximumSpeed, 0, 1);
    const lowSpeedTurnRate = THREE.MathUtils.lerp(
      PURSUER_TUNING.lowSpeedTurnRate,
      CHASE_TUNING.accuracyRamp.lowSpeedTurnRate,
      accuracy,
    );
    const highSpeedTurnRate = THREE.MathUtils.lerp(
      PURSUER_TUNING.highSpeedTurnRate,
      CHASE_TUNING.accuracyRamp.highSpeedTurnRate,
      accuracy,
    );
    const baseTurnRate = THREE.MathUtils.lerp(lowSpeedTurnRate, highSpeedTurnRate, speedRatio);
    const closeRangeSteeringFloor = THREE.MathUtils.lerp(
      0.45,
      CHASE_TUNING.accuracyRamp.closeRangeSteeringFloor,
      accuracy,
    );
    const closeRangeSteering = THREE.MathUtils.lerp(
      closeRangeSteeringFloor,
      1,
      THREE.MathUtils.smoothstep(distanceToPlayer, 5, 16),
    );
    const turnRate = baseTurnRate * closeRangeSteering;
    const headingStep = THREE.MathUtils.clamp(headingError, -turnRate * dt, turnRate * dt);
    heading = normalizeAngle(heading + headingStep);

    const onPavement = world.isOnPavement(position);
    const maximumSpeed = onPavement
      ? PURSUER_TUNING.maximumSpeed
      : PURSUER_TUNING.offRoadMaximumSpeed;
    const catchUp = THREE.MathUtils.smoothstep(distanceToPlayer, 14, 45)
      * PURSUER_TUNING.maximumCatchUpSpeed;
    let requestedSpeed = Math.max(14, player.speed + catchUp);
    if (distanceToPlayer < 10) {
      requestedSpeed = Math.max(11, player.speed + PURSUER_TUNING.closeRangeSpeedAdvantage);
    }
    const targetSpeed = Math.min(maximumSpeed, requestedSpeed);
    const speedChange = targetSpeed > speed
      ? PURSUER_TUNING.acceleration * dt
      : PURSUER_TUNING.deceleration * dt;
    speed += THREE.MathUtils.clamp(targetSpeed - speed, -speedChange, speedChange);

    forward.set(Math.sin(heading), 0, Math.cos(heading));
    const distance = speed * dt;
    const steps = Math.max(1, Math.ceil(distance / 0.65));
    let hadWorldCollision = false;
    for (let step = 0; step < steps; step++) {
      position.addScaledVector(forward, distance / steps);
      const collision = world.queryCollision(position, PURSUER_TUNING.radius);
      if (!collision) continue;

      hadWorldCollision = true;
      position.x += collision.normalX * collision.penetration;
      position.z += collision.normalZ * collision.penetration;
      const tangentA = Math.atan2(collision.normalZ, -collision.normalX);
      const tangentB = normalizeAngle(tangentA + Math.PI);
      avoidanceHeading = Math.abs(angleDifference(tangentA, targetHeading))
          < Math.abs(angleDifference(tangentB, targetHeading))
        ? tangentA
        : tangentB;
      avoidanceTime = 0.72;
      heading = normalizeAngle(heading + THREE.MathUtils.clamp(
        angleDifference(heading, avoidanceHeading),
        -0.42,
        0.42,
      ));
      forward.set(Math.sin(heading), 0, Math.cos(heading));
      speed *= 0.48;
    }

    if (
      hadWorldCollision
      && pursuitTime - lastCollisionEpisode >= PURSUER_TUNING.collisionEpisodeCooldown
    ) {
      lastCollisionEpisode = pursuitTime;
      collisionEpisodes.push(pursuitTime);
    }
    while (
      collisionEpisodes.length > 0
      && pursuitTime - collisionEpisodes[0] > PURSUER_TUNING.collisionBurstWindow
    ) collisionEpisodes.shift();

    const resolvedDistance = horizontalDistance(position, player.position);
    if (speed < PURSUER_TUNING.stuckSpeed && resolvedDistance > PURSUER_TUNING.stuckDistance) {
      lowSpeedTime += dt;
    } else {
      lowSpeedTime = 0;
    }
    const stuckAwayFromPlayer = resolvedDistance > PURSUER_TUNING.stuckDistance
      && (
        lowSpeedTime >= PURSUER_TUNING.stuckDuration
        || collisionEpisodes.length >= PURSUER_TUNING.collisionBurstCount
      );
    const needsRespawn = world.isOutsideBoundary(position, PURSUER_TUNING.radius)
      || stuckAwayFromPlayer;
    if (needsRespawn && resetBehind(player, formationSlot)) {
      return {
        distanceToPlayer: horizontalDistance(position, player.position),
        playerCollision: null,
        respawned: true,
      };
    }
    if (needsRespawn) {
      lowSpeedTime = 0;
      collisionEpisodes.length = 0;
    }

    const vehicleCollision = queryVehicleCollision(
      player.position,
      player.heading,
      position,
      heading,
    );
    let playerCollision: PlayerExternalCollision | null = null;
    if (vehicleCollision) {
      const pursuerVelocityX = Math.sin(heading) * speed;
      const pursuerVelocityZ = Math.cos(heading) * speed;
      const relativeVelocityX = player.velocity.x - pursuerVelocityX;
      const relativeVelocityZ = player.velocity.z - pursuerVelocityZ;
      const closingSpeed = Math.max(0, -(
        relativeVelocityX * vehicleCollision.normalX
        + relativeVelocityZ * vehicleCollision.normalZ
      ));
      position.x -= vehicleCollision.normalX * vehicleCollision.penetration * 0.55;
      position.z -= vehicleCollision.normalZ * vehicleCollision.penetration * 0.55;
      speed *= THREE.MathUtils.lerp(0.82, 0.52, THREE.MathUtils.clamp(closingSpeed / 14, 0, 1));
      playerCollision = {
        normalX: vehicleCollision.normalX,
        normalZ: vehicleCollision.normalZ,
        penetration: vehicleCollision.penetration * 0.45,
        closingSpeed,
      };
    }

    steeringVisual = THREE.MathUtils.lerp(
      steeringVisual,
      THREE.MathUtils.clamp(headingError * 0.7, -0.5, 0.5),
      1 - Math.exp(-10 * dt),
    );
    car.frontWheels.forEach((wheel) => (wheel.rotation.y = steeringVisual));
    car.wheels.forEach((wheel) => (wheel.rotation.x += speed * dt / 0.42));
    car.brakeLights.forEach((light) => {
      const material = light.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = targetSpeed < speed ? 4.5 : 1.2;
    });

    sirenTime += dt;
    car.emergencyLights.forEach((light, index) => {
      const material = light.material as THREE.MeshStandardMaterial;
      const pulse = Math.sin(sirenTime * 16 + index * Math.PI) > 0;
      material.emissiveIntensity = pulse ? 7 : 0.65;
    });
    placeCar();
    return {
      distanceToPlayer: horizontalDistance(position, player.position),
      playerCollision,
      respawned: false,
    };
  }

  return {
    setVisible(visible) {
      car.group.visible = visible;
    },
    resetBehind,
    update,
    destroy() {
      scene.remove(car.group);
      car.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
    },
  };
}

function horizontalDistance(a: THREE.Vector3, b: THREE.Vector3) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function angleDifference(from: number, to: number) {
  return normalizeAngle(to - from);
}
