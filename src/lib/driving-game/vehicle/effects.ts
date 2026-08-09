import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);

type SmokeParticle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
};

export function createDriftSmoke(scene: THREE.Scene) {
  const geometry = new THREE.IcosahedronGeometry(0.34, 1);
  const particles: SmokeParticle[] = [];
  for (let i = 0; i < 32; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xdde2dd,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    particles.push({ mesh, velocity: new THREE.Vector3(), life: 0, maxLife: 1 });
  }

  let cursor = 0;
  let spawnBudget = 0;
  let wheelSide = -1;

  return {
    update(dt: number, carPosition: THREE.Vector3, heading: number, intensity: number, speed: number) {
      for (const particle of particles) {
        if (particle.life <= 0) continue;
        particle.life -= dt;
        if (particle.life <= 0) {
          particle.mesh.visible = false;
          continue;
        }
        const age = 1 - particle.life / particle.maxLife;
        particle.mesh.position.addScaledVector(particle.velocity, dt);
        particle.mesh.position.y += dt * 0.24;
        particle.mesh.scale.setScalar(0.65 + age * 2.3);
        (particle.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(age * Math.PI) * 0.24;
      }

      if (intensity < 0.04 || speed < 5) return;
      spawnBudget += dt * (10 + intensity * 30);
      const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      while (spawnBudget >= 1) {
        spawnBudget -= 1;
        const particle = particles[cursor++ % particles.length];
        wheelSide *= -1;
        particle.life = particle.maxLife = 0.55 + Math.random() * 0.38;
        particle.mesh.visible = true;
        particle.mesh.position
          .copy(carPosition)
          .addScaledVector(forward, -1.35)
          .addScaledVector(right, wheelSide * 0.92);
        particle.mesh.position.y = 0.28;
        particle.mesh.scale.setScalar(0.65);
        particle.velocity
          .copy(forward)
          .multiplyScalar(-0.35 - Math.random() * 0.55)
          .addScaledVector(right, (Math.random() - 0.5) * 0.75);
      }
    },
    reset() {
      spawnBudget = 0;
      particles.forEach((particle) => {
        particle.life = 0;
        particle.mesh.visible = false;
      });
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
  let cursor = 0;
  let distanceBudget = 0;

  return {
    update(carPosition: THREE.Vector3, heading: number, intensity: number, distance: number) {
      if (intensity < 0.16) {
        distanceBudget = 0;
        return;
      }
      distanceBudget += distance;
      const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      quaternion.setFromAxisAngle(UP, heading);
      let changed = false;
      while (distanceBudget >= 0.52) {
        distanceBudget -= 0.52;
        for (const side of [-1, 1]) {
          const markPosition = carPosition
            .clone()
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
  };
}

