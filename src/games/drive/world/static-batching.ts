import * as THREE from "three";

export type StaticBatchStats = {
  sourceMeshes: number;
  sourceInstances: number;
  batches: number;
  vertices: number;
};

type BatchPart = {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  color: THREE.Color;
};

type Batch = {
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
  parts: BatchPart[];
};

const DEFAULT_CHUNK_SIZE = 128;

/**
 * Collapses the static world into a few vertex-colored meshes per spatial chunk.
 *
 * World objects never move after construction, so per-object draw calls, frustum
 * tests, and material switches are pure overhead. Every opaque, untextured mesh is
 * baked into world space, its material color (and instance color) becomes a vertex
 * color, and meshes that share the remaining material state, shadow flags, and chunk
 * become one draw. Anything this cannot represent faithfully is left untouched.
 */
export function batchStaticMeshes(root: THREE.Object3D, chunkSize = DEFAULT_CHUNK_SIZE): StaticBatchStats {
  root.updateMatrixWorld(true);
  const batches = new Map<string, Batch>();
  const sources: THREE.Mesh[] = [];
  const keptMaterials = new Set<THREE.Material>();
  const keptGeometries = new Set<THREE.BufferGeometry>();
  const instanceMatrix = new THREE.Matrix4();
  const instanceColor = new THREE.Color();
  const center = new THREE.Vector3();
  let sourceInstances = 0;

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.Material | THREE.Material[];
    if (!isBatchable(object, material)) {
      const materials = Array.isArray(material) ? material : [material];
      materials.forEach((entry) => keptMaterials.add(entry));
      keptGeometries.add(object.geometry);
      return;
    }
    const signature = materialSignature(material, object);
    const baseColor = (material as THREE.MeshBasicMaterial).color ?? new THREE.Color(0xffffff);
    const geometry = object.geometry as THREE.BufferGeometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const addPart = (matrix: THREE.Matrix4, color: THREE.Color) => {
      geometry.boundingBox!.getCenter(center).applyMatrix4(matrix);
      const chunkKey = `${Math.floor(center.x / chunkSize)}:${Math.floor(center.z / chunkSize)}`;
      const key = `${signature}|${chunkKey}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = {
          material,
          castShadow: object.castShadow,
          receiveShadow: object.receiveShadow,
          renderOrder: object.renderOrder,
          parts: [],
        };
        batches.set(key, batch);
      }
      batch.parts.push({ geometry, matrix, color });
    };

    if (object instanceof THREE.InstancedMesh) {
      for (let index = 0; index < object.count; index++) {
        object.getMatrixAt(index, instanceMatrix);
        const color = baseColor.clone();
        if (object.instanceColor) color.multiply(object.getColorAt(index, instanceColor));
        addPart(object.matrixWorld.clone().multiply(instanceMatrix), color);
      }
      sourceInstances += object.count;
    } else {
      addPart(object.matrixWorld.clone(), baseColor.clone());
      sourceInstances++;
    }
    sources.push(object);
  });

  if (sources.length === 0) return { sourceMeshes: 0, sourceInstances: 0, batches: 0, vertices: 0 };

  const batchMaterials = new Map<string, THREE.Material>();
  let vertices = 0;
  const batchMeshes: THREE.Mesh[] = [];
  batches.forEach((batch, key) => {
    const signature = key.slice(0, key.lastIndexOf("|"));
    let material = batchMaterials.get(signature);
    if (!material) {
      material = batch.material.clone();
      (material as THREE.MeshBasicMaterial).color?.set(0xffffff);
      material.vertexColors = true;
      batchMaterials.set(signature, material);
    }
    const geometry = mergeParts(batch.parts);
    vertices += geometry.getAttribute("position").count;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "static-batch";
    mesh.castShadow = batch.castShadow;
    mesh.receiveShadow = batch.receiveShadow;
    mesh.renderOrder = batch.renderOrder;
    batchMeshes.push(mesh);
  });

  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();
  for (const source of sources) {
    source.removeFromParent();
    if (source instanceof THREE.InstancedMesh) source.dispose();
    if (!keptGeometries.has(source.geometry)) disposedGeometries.add(source.geometry);
    const material = source.material as THREE.Material;
    if (!keptMaterials.has(material)) disposedMaterials.add(material);
  }
  disposedGeometries.forEach((geometry) => geometry.dispose());
  disposedMaterials.forEach((material) => material.dispose());
  pruneEmptyGroups(root);
  batchMeshes.forEach((mesh) => root.add(mesh));
  root.updateMatrixWorld(true);

  return {
    sourceMeshes: sources.length,
    sourceInstances,
    batches: batchMeshes.length,
    vertices,
  };
}

function isBatchable(object: THREE.Mesh, material: THREE.Material | THREE.Material[]): material is THREE.Material {
  if (!object.visible || Array.isArray(material)) return false;
  if (object.morphTargetInfluences || (object as Partial<THREE.SkinnedMesh>).isSkinnedMesh) return false;
  if (!(material instanceof THREE.MeshStandardMaterial) && !(material instanceof THREE.MeshBasicMaterial)) return false;
  if (material.transparent || material.alphaTest > 0 || material.wireframe) return false;
  // Any texture slot would need UVs and per-source texture identity; leave those meshes alone.
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) return false;
  }
  let hidden = false;
  object.traverseAncestors((ancestor) => { if (!ancestor.visible) hidden = true; });
  if (hidden) return false;
  const position = object.geometry.getAttribute("position");
  if (!position || position.itemSize !== 3) return false;
  const color = object.geometry.getAttribute("color");
  if (color && color.itemSize !== 3) return false;
  if (color && !material.vertexColors) return false;
  return true;
}

function materialSignature(material: THREE.Material, object: THREE.Mesh) {
  const standard = material instanceof THREE.MeshStandardMaterial ? material : null;
  return [
    material.type,
    standard ? standard.roughness.toFixed(3) : "",
    standard ? standard.metalness.toFixed(3) : "",
    standard ? standard.emissive.getHexString() : "",
    standard ? standard.emissiveIntensity.toFixed(3) : "",
    standard?.flatShading ? "flat" : "smooth",
    material.side,
    material.depthWrite,
    material.depthTest,
    material.polygonOffset ? `${material.polygonOffsetFactor}:${material.polygonOffsetUnits}` : "",
    (material as THREE.MeshBasicMaterial).fog,
    material.toneMapped,
    object.castShadow,
    object.receiveShadow,
    object.renderOrder,
  ].join(",");
}

function mergeParts(parts: readonly BatchPart[]) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const part of parts) {
    vertexCount += part.geometry.getAttribute("position").count;
    indexCount += part.geometry.index?.count ?? part.geometry.getAttribute("position").count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  const normalMatrix = new THREE.Matrix3();
  const vertex = new THREE.Vector3();
  let vertexOffset = 0;
  let indexOffset = 0;

  for (const { geometry, matrix, color } of parts) {
    const position = geometry.getAttribute("position");
    let normal = geometry.getAttribute("normal");
    if (!normal) {
      geometry.computeVertexNormals();
      normal = geometry.getAttribute("normal");
    }
    const vertexColor = geometry.getAttribute("color");
    normalMatrix.getNormalMatrix(matrix);
    for (let index = 0; index < position.count; index++) {
      const target = (vertexOffset + index) * 3;
      vertex.fromBufferAttribute(position, index).applyMatrix4(matrix);
      positions[target] = vertex.x;
      positions[target + 1] = vertex.y;
      positions[target + 2] = vertex.z;
      vertex.fromBufferAttribute(normal, index).applyMatrix3(normalMatrix).normalize();
      normals[target] = vertex.x;
      normals[target + 1] = vertex.y;
      normals[target + 2] = vertex.z;
      colors[target] = color.r * (vertexColor ? vertexColor.getX(index) : 1);
      colors[target + 1] = color.g * (vertexColor ? vertexColor.getY(index) : 1);
      colors[target + 2] = color.b * (vertexColor ? vertexColor.getZ(index) : 1);
    }
    // Mirrored transforms reverse triangle winding; swap two corners to keep faces front-facing.
    const mirrored = matrix.determinant() < 0;
    const sourceIndex = geometry.index;
    const sourceIndexCount = sourceIndex?.count ?? position.count;
    for (let index = 0; index < sourceIndexCount; index += 3) {
      const a = sourceIndex ? sourceIndex.getX(index) : index;
      const b = sourceIndex ? sourceIndex.getX(index + 1) : index + 1;
      const c = sourceIndex ? sourceIndex.getX(index + 2) : index + 2;
      indices[indexOffset + index] = vertexOffset + a;
      indices[indexOffset + index + 1] = vertexOffset + (mirrored ? c : b);
      indices[indexOffset + index + 2] = vertexOffset + (mirrored ? b : c);
    }
    vertexOffset += position.count;
    indexOffset += sourceIndexCount;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function pruneEmptyGroups(root: THREE.Object3D) {
  for (const child of [...root.children]) {
    pruneEmptyGroups(child);
    if (child.type === "Group" && child.children.length === 0) child.removeFromParent();
  }
}
