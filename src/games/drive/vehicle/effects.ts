import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);

type SmokeParticle = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  scale: number;
  life: number;
  maxLife: number;
};

const SMOKE_CAPACITY = 32;

/** Unlit smoke with a per-instance opacity, so every puff shares one draw call. */
function createSmokeMaterial() {
  const material = new THREE.MeshBasicMaterial({
    color: 0xdde2dd,
    transparent: true,
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float instanceOpacity;\nvarying float vInstanceOpacity;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvInstanceOpacity = instanceOpacity;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vInstanceOpacity;")
      .replace("#include <alphatest_fragment>", "diffuseColor.a *= vInstanceOpacity;\n#include <alphatest_fragment>");
  };
  material.customProgramCacheKey = () => "drift-smoke-instance-opacity";
  return material;
}

export function createDriftSmoke(scene: THREE.Scene) {
  const geometry = new THREE.IcosahedronGeometry(0.34, 1);
  const opacities = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_CAPACITY), 1);
  opacities.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("instanceOpacity", opacities);
  const mesh = new THREE.InstancedMesh(geometry, createSmokeMaterial(), SMOKE_CAPACITY);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.renderOrder = 2;
  // Puffs drift around the car; a cached bounding sphere would cull them incorrectly.
  mesh.frustumCulled = false;
  scene.add(mesh);
  const particles: SmokeParticle[] = Array.from({ length: SMOKE_CAPACITY }, () => ({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    scale: 0,
    life: 0,
    maxLife: 1,
  }));
  const matrix = new THREE.Matrix4();
  const identity = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  let cursor = 0;
  let spawnBudget = 0;
  let wheelSide = -1;
  let live = 0;

  function writeInstances() {
    let count = 0;
    for (const particle of particles) {
      if (particle.life <= 0) continue;
      const age = 1 - particle.life / particle.maxLife;
      matrix.compose(particle.position, identity, scale.setScalar(particle.scale));
      mesh.setMatrixAt(count, matrix);
      opacities.setX(count, Math.sin(age * Math.PI) * 0.24);
      count++;
    }
    // Skip uploads entirely once the last puff has faded.
    if (count === 0 && mesh.count === 0) return;
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    opacities.needsUpdate = true;
  }

  return {
    update(dt: number, carPosition: THREE.Vector3, heading: number, intensity: number, speed: number) {
      live = 0;
      for (const particle of particles) {
        if (particle.life <= 0) continue;
        particle.life -= dt;
        if (particle.life <= 0) continue;
        live++;
        const age = 1 - particle.life / particle.maxLife;
        particle.position.addScaledVector(particle.velocity, dt);
        particle.position.y += dt * 0.24;
        particle.scale = 0.65 + age * 2.3;
      }

      if (intensity >= 0.04 && speed >= 5) {
        spawnBudget += dt * (10 + intensity * 30);
        forward.set(Math.sin(heading), 0, Math.cos(heading));
        right.set(forward.z, 0, -forward.x);
        while (spawnBudget >= 1) {
          spawnBudget -= 1;
          const particle = particles[cursor++ % particles.length];
          wheelSide *= -1;
          particle.life = particle.maxLife = 0.55 + Math.random() * 0.38;
          particle.position
            .copy(carPosition)
            .addScaledVector(forward, -1.35)
            .addScaledVector(right, wheelSide * 0.92);
          particle.position.y = 0.28;
          particle.scale = 0.65;
          particle.velocity
            .copy(forward)
            .multiplyScalar(-0.35 - Math.random() * 0.55)
            .addScaledVector(right, (Math.random() - 0.5) * 0.75);
          live++;
        }
      }
      if (live > 0 || mesh.count > 0) writeInstances();
    },
    reset() {
      spawnBudget = 0;
      particles.forEach((particle) => {
        particle.life = 0;
      });
      mesh.count = 0;
    },
    destroy() {
      scene.remove(mesh);
      mesh.dispose();
      (mesh.material as THREE.Material).dispose();
      geometry.dispose();
    },
  };
}

export function createSkidMarks(scene: THREE.Scene) {
  const capacity = 260;
  const marks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.16, 0.012, 0.72),
    new THREE.MeshBasicMaterial({ color: 0x171a18, transparent: true, opacity: 0.34, depthWrite: false }),
    capacity,
  );
  marks.count = 0;
  marks.renderOrder = 1;
  // Instance positions move around a ring buffer, so a cached bounding sphere would cull them incorrectly.
  marks.frustumCulled = false;
  scene.add(marks);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const markPosition = new THREE.Vector3();
  let cursor = 0;
  let distanceBudget = 0;

  return {
    update(carPosition: THREE.Vector3, heading: number, intensity: number, distance: number) {
      if (intensity < 0.16) {
        distanceBudget = 0;
        return;
      }
      distanceBudget += distance;
      forward.set(Math.sin(heading), 0, Math.cos(heading));
      right.set(forward.z, 0, -forward.x);
      quaternion.setFromAxisAngle(UP, heading);
      let changed = false;
      while (distanceBudget >= 0.52) {
        distanceBudget -= 0.52;
        for (let side = -1; side <= 1; side += 2) {
          markPosition
            .copy(carPosition)
            .addScaledVector(forward, -1.28)
            .addScaledVector(right, side * 0.91);
          markPosition.y = 0.125;
          matrix.compose(markPosition, quaternion, scale);
          marks.setMatrixAt(cursor % capacity, matrix);
          cursor++;
          changed = true;
        }
      }
      marks.count = Math.min(cursor, capacity);
      if (changed) marks.instanceMatrix.needsUpdate = true;
    },
    reset() {
      cursor = 0;
      distanceBudget = 0;
      marks.count = 0;
      marks.instanceMatrix.needsUpdate = true;
    },
    destroy() {
      scene.remove(marks);
      marks.geometry.dispose();
      (marks.material as THREE.Material).dispose();
    },
  };
}

