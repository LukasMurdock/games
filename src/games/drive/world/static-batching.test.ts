import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { GAME_MAPS } from "../maps";
import { buildWorld } from "./build-world";
import { SpatialGrid } from "./spatial-grid";
import { batchStaticMeshes } from "./static-batching";

function standard(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
}

function meshes(root: THREE.Object3D) {
  const result: THREE.Mesh[] = [];
  root.traverse((object) => { if (object instanceof THREE.Mesh) result.push(object); });
  return result;
}

function triangleNormal(geometry: THREE.BufferGeometry, triangle: number) {
  const index = geometry.index!;
  const position = geometry.getAttribute("position");
  const [a, b, c] = [0, 1, 2].map((corner) => new THREE.Vector3().fromBufferAttribute(
    position,
    index.getX(triangle * 3 + corner),
  ));
  return new THREE.Vector3().crossVectors(b.sub(a), c.sub(a)).normalize();
}

describe("batchStaticMeshes", () => {
  it("merges differently colored meshes that share material state into one vertex-colored draw", () => {
    const root = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), standard(0xff0000));
    red.position.set(4, 0, 0);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), standard(0x0000ff));
    const nested = new THREE.Group();
    nested.position.set(0, 0, 6);
    nested.add(blue);
    root.add(red, nested);

    const stats = batchStaticMeshes(root);

    expect(stats).toMatchObject({ sourceMeshes: 2, sourceInstances: 2, batches: 1, vertices: 48 });
    const [batch] = meshes(root);
    expect(root.children).toEqual([batch]);
    expect((batch.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    batch.geometry.computeBoundingBox();
    expect(batch.geometry.boundingBox!.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
    expect(batch.geometry.boundingBox!.max.toArray()).toEqual([4.5, 0.5, 6.5]);
    const colors = batch.geometry.getAttribute("color");
    const sampled = new Set<string>();
    for (let index = 0; index < colors.count; index++) {
      sampled.add([colors.getX(index), colors.getY(index), colors.getZ(index)].join(","));
    }
    expect(sampled).toEqual(new Set(["1,0,0", "0,0,1"]));
  });

  it("keeps shadow flags, transparency, and material state as separate batches", () => {
    const root = new THREE.Group();
    const caster = new THREE.Mesh(new THREE.BoxGeometry(), standard(0xffffff));
    caster.castShadow = true;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(), standard(0xffffff));
    const glossy = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ roughness: 0.2, flatShading: true }),
    );
    const transparent = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 }),
    );
    root.add(caster, receiver, glossy, transparent);

    const stats = batchStaticMeshes(root);

    expect(stats.batches).toBe(3);
    expect(root.children).toContain(transparent);
    expect(meshes(root).filter((mesh) => mesh.castShadow)).toHaveLength(1);
  });

  it("expands instanced meshes with instance colors and splits by spatial chunk", () => {
    const root = new THREE.Group();
    const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), standard(0xffffff), 3);
    const matrix = new THREE.Matrix4();
    [0, 10, 300].forEach((x, index) => {
      instanced.setMatrixAt(index, matrix.makeTranslation(x, 0, 0));
      instanced.setColorAt(index, new THREE.Color(index === 1 ? 0x00ff00 : 0xffffff));
    });
    instanced.count = 3;
    root.add(instanced);

    const stats = batchStaticMeshes(root, 128);

    expect(stats).toMatchObject({ sourceInstances: 3, batches: 2, vertices: 72 });
    const colors = meshes(root).flatMap((mesh) => {
      const attribute = mesh.geometry.getAttribute("color");
      return Array.from({ length: attribute.count }, (_, index) => attribute.getX(index));
    });
    expect(colors.filter((red) => red === 0)).toHaveLength(24);
  });

  it("preserves outward-facing winding under mirrored transforms", () => {
    const root = new THREE.Group();
    const mirrored = new THREE.Mesh(new THREE.BoxGeometry(), standard(0xffffff));
    mirrored.scale.set(-1, 1, 1);
    root.add(mirrored);

    batchStaticMeshes(root);

    const [batch] = meshes(root);
    const position = batch.geometry.getAttribute("position");
    const index = batch.geometry.index!;
    for (let triangle = 0; triangle < index.count / 3; triangle++) {
      const centroid = new THREE.Vector3();
      for (let corner = 0; corner < 3; corner++) {
        centroid.add(new THREE.Vector3().fromBufferAttribute(position, index.getX(triangle * 3 + corner)));
      }
      expect(triangleNormal(batch.geometry, triangle).dot(centroid)).toBeGreaterThan(0);
    }
  });

  it("leaves hidden and textured meshes untouched", () => {
    const root = new THREE.Group();
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(), standard(0xffffff));
    hidden.visible = false;
    const textured = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ map: new THREE.Texture() }),
    );
    root.add(hidden, textured);

    expect(batchStaticMeshes(root).sourceMeshes).toBe(0);
    expect(root.children).toEqual([hidden, textured]);
  });

  it("collapses every registered map into a small set of draws", () => {
    for (const map of Object.values(GAME_MAPS)) {
      const scene = new THREE.Scene();
      const world = buildWorld(scene, map);
      const diagnostics = world.getDiagnostics();
      const remaining = meshes(scene).filter((mesh) => mesh.name !== "static-batch");
      expect(diagnostics.staticBatches, map.id).toBeGreaterThan(0);
      expect(diagnostics.staticBatches, map.id).toBeLessThan(diagnostics.batchedSources / 4);
      // Only intentionally transparent overlays may remain outside a batch.
      expect(remaining.every((mesh) => (mesh.material as THREE.Material).transparent), map.id).toBe(true);
      world.destroy();
    }
  });
});

describe("SpatialGrid", () => {
  it("round-trips negative cells and de-duplicates items spanning several cells", () => {
    const wide = { minX: -40, maxX: 40, minZ: -5, maxZ: 5 };
    const point = { minX: -70, maxX: -70, minZ: 90, maxZ: 90 };
    const grid = new SpatialGrid([wide, point], 32);

    expect(grid.query(-100, 100, -10, 10)).toEqual([wide]);
    expect(grid.query(-70, -70, 90, 90)).toEqual([point]);
    expect(grid.query(500, 500, 500, 500)).toEqual([]);
    expect(grid.getOccupiedCells()).toEqual(expect.arrayContaining([
      { x: -2, z: -1 },
      { x: 1, z: 0 },
      { x: -3, z: 2 },
    ]));
  });
});
