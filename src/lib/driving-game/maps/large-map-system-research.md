# Decision report

## Executive recommendation

Stay code-first and replace the raw coordinate arrays with a small, driving-specific TypeScript authoring DSL compiled at build time into a compact canonical map representation.

Do not adopt Tiled, LDtk, or Blender as the primary map source yet. Tiled is the strongest external-editor candidate, but the current team and art style benefit more from parameterized corridors, reusable districts, deterministic generation, source control, and automated validation than from freehand object placement. Add a Tiled importer later only if authoring usability—not runtime performance—becomes the measured bottleneck.

For runtime:

- Keep the entire 400–700-unit map resident.
- Partition it into spatial chunks for batching, frustum culling, collision lookup, and pavement lookup.
- Do not implement streaming.
- Do not implement a navmesh, ECS, physics engine, actor hierarchy, or generic navigation framework.
- Render roads as compiled continuous strips rather than overlapping boxes.
- Batch static geometry by chunk, prototype, and material.
- Move a fixed-size shadow volume with the player rather than expanding it to cover the map.
- Preserve Chase’s physical, smoothed direct pursuit, adding only predictive obstacle avoidance and safe rear-placement support.

A 3–5× increase in linear size does not inherently require LOD or streaming. It requires decoupling runtime cost from total authored object count.

---

# 1. Current-system audit

The current separation is good: maps describe space, `buildWorld` owns runtime spatial truth, the player and Chase use the same `WorldRuntime`, and map switching retains the renderer and player. Those boundaries should remain.

Relevant implementation points:

- Current maps are literal arrays of roads, lots, buildings, trees, lights, and barriers in [maps/types.ts](/Users/lukasmurdock/Documents/GitHub/LukasMurdock.github.io/src/lib/driving-game/maps/types.ts:1).
- World creation and all spatial queries live in [build-world.ts](/Users/lukasmurdock/Documents/GitHub/LukasMurdock.github.io/src/lib/driving-game/world/build-world.ts:31).
- Map replacement destroys the old world before synchronously building the new one in [runtime.ts](/Users/lukasmurdock/Documents/GitHub/LukasMurdock.github.io/src/lib/driving-game/runtime.ts:298).
- The player queries pavement once per update and collision once per movement substep in [player-controller.ts](/Users/lukasmurdock/Documents/GitHub/LukasMurdock.github.io/src/lib/driving-game/player/player-controller.ts:188).
- Each pursuer does the same and uses direct predicted pursuit plus post-contact tangent selection in [pursuer.ts](/Users/lukasmurdock/Documents/GitHub/LukasMurdock.github.io/src/lib/driving-game/modes/chase/pursuer.ts:100).

## Current content size

| Map | `worldLimit` | Playable square | Roads | Lots | Obstacles |
|---|---:|---:|---:|---:|---:|
| Circuit City | 150 | 90,000 units² | 11 plus circuit | 3 | 40 |
| Crosswind | 118 | 55,696 units² | 5 | 2 | 8 |
| Switchyard | 118 | 55,696 units² | 4 | 2 | 7 |

“Obstacles” here means buildings, trees, lights, and barriers.

A 3× linear map has 9× the area; a 5× map has 25×. If content density remains comparable, Circuit City’s 40 obstacles become approximately 360–1,000 obstacles. That is still modest map data, but it is not modest if each decorative part becomes its own Three.js object and draw call.

## Static allocation and draw-call estimate

Static source analysis gives these approximate worst-case counts before camera/frustum rejection:

| Map | Main-pass mesh draws | Shadow-caster draws | Geometries allocated | Materials allocated |
|---|---:|---:|---:|---:|
| Circuit City | ~728 | ~175 | ~721 | ~204 |
| Crosswind | ~114 | ~17 | ~108 | ~40 |
| Switchyard | ~133 | ~16 | ~127 | ~44 |

These are estimates, not `renderer.info` measurements. They count each ordinary single-material mesh as one draw and each `InstancedMesh` as one draw. Circuit City is dominated by roughly 444 individual road-mark meshes.

This agrees with Three.js’s documented model: drawing multiple meshes incurs multiple draw submissions, and merging or batching is the standard way to reduce that overhead. [Three.js: Optimize Lots of Objects](https://threejs.org/manual/en/optimize-lots-of-objects.html)

At equal density, blindly multiplying Circuit City gives roughly:

- 3× linear: ~6,500 main-pass mesh submissions and ~1,575 shadow casters.
- 5× linear: ~18,000 main-pass mesh submissions and ~4,375 shadow casters.

Frustum culling would reject much of the main scene, but an enlarged whole-map shadow camera could still encompass most casters. This is the primary scaling failure.

## Rendering and allocation problems

### Roads and paint

Each road currently allocates its own `BoxGeometry`. Each dash or parking stripe allocates a separate `PlaneGeometry` and `Mesh`. Rotated taxiways likewise generate separate marking meshes.

Scaling road length therefore increases:

- JavaScript objects;
- scene traversal and culling work;
- draw calls;
- geometry buffers;
- synchronous build and disposal time.

Road area itself is cheap. The representation is expensive.

### Buildings and props

Buildings reuse almost nothing across building instances. Foundations, bodies, roofs, doors, awnings, freight bays, and materials are generally allocated per building. Trees allocate four geometries and four materials apiece; streetlights allocate four geometries per light.

The art is visually ideal for instancing—simple repeated silhouettes and colors—but the builders do not exploit that at the map level.

### Disposal

The current `destroy()` correctly removes the world root, discovers geometries/materials, deduplicates them, and calls `dispose()`. That is important because Three.js does not automatically free geometry, material, and texture GPU resources when objects leave a scene. [Three.js disposal guide](https://threejs.org/manual/en/how-to-dispose-of-objects.html)

One gap is that current Three.js also exposes `InstancedMesh.dispose()` for instance-specific GPU resources, but the traversal only disposes its geometry and material. [Three.js `InstancedMesh`](https://threejs.org/docs/pages/InstancedMesh.html)

A future shared asset catalog also makes traversal-based ownership unsafe: blindly disposing a shared geometry or material would invalidate the next map. Ownership should become explicit.

## Spatial-query complexity

### Collision

`queryCollision` linearly examines every obstacle until the first collision.

Current approximate worst case at 60 Hz:

- Player: up to about three movement substeps.
- Three pursuers: about three substeps each at top speed.
- Total: roughly 12 collision queries/frame.
- Circuit City: `12 × 40 = 480` AABB tests/frame.

At equal density on larger maps:

- 3× linear: ~4,300 tests/frame.
- 5× linear: ~12,000 tests/frame.

That alone is not catastrophic, but it is unnecessary, creates scale-dependent latency, and combines with Chase, rendering, audio, and Safari’s main-thread constraints.

The collision method also returns the first colliding box, not necessarily the deepest or most important collision. Dense overlapping compiled stamps could make ordering more visible.

### Pavement

Rectangle roads and parking lots are also scanned linearly. Circuit pavement adds a 336-point nearest-sample scan whenever no rectangle matches.

With player plus three pursuers, off-road positions around Circuit City can trigger approximately:

- `(11 roads + 3 lots + 336 circuit samples) × 4 actors`
- roughly 1,400 primitive checks/frame.

For a large corridor map, pavement should be indexed and use analytic segment/capsule distance rather than hundreds of nearest samples.

### Boundary

The square boundary check is constant time and scales perfectly. The fence’s post count grows only linearly, and its posts are already instanced. Boundary rendering needs chunking/readability work, not a more complex collision model.

## Shadows and fog

The shadow camera currently expands according to `map.environment.shadowExtent` and stays aimed around the world origin. That works for 118–150-unit maps. Expanding a 2048² map across a 500-unit half-extent would reduce texel density by roughly 3–4×, and the useful player area would occupy a tiny fraction of the map.

Three.js shadow maps render shadow-casting objects from the shadow light’s viewpoint before the normal scene render. Enlarging the coverage and caster set is therefore directly expensive. [Three.js shadows manual](https://threejs.org/manual/en/shadows.html)

Fog is already camera-relative and does not need to scale with the full world. The current instinct to tie `fogFar`, camera far planes, and shadows to map size should be removed.

## Map switching

Switching currently does:

1. Destroy mode.
2. Destroy old world.
3. Build new world synchronously.
4. Reattach player and construct the new mode.

For current maps this is acceptable. With thousands of new objects, it produces a pause with no rollback path and first-render shader/buffer work immediately afterward.

Three.js exposes `renderer.info` for draw calls, triangles, geometries, textures, and programs, and `compileAsync` to precompile materials without the normal first-frame stall where supported. [Three.js `WebGLRenderer`](https://threejs.org/docs/pages/WebGLRenderer.html)

---

# 2. Authoring approach comparison

| Approach | Freeform rotated roads | Reuse/parameterization | Validation | Runtime fit | Recommendation |
|---|---|---|---|---|---|
| Larger raw TS arrays | Adequate for rotated rectangles; poor for curves | Copy/paste only | Type checking, little semantic checking | Requires a later compilation pass anyway | Reject for new large maps |
| Typed macro/stamp DSL | Excellent: corridors, arcs, transforms, stamps | Excellent | Excellent, build-time and domain-specific | Produces exactly the desired IR | Adopt |
| Tiled object-layer import | Good: freely placed, resized, rotated rectangles/polylines | Good templates and custom properties | Importer must enforce project rules | Good after compilation | Keep as optional future adapter |
| Blender/glTF | Excellent visual/freeform editing | Collections, linked assets, geometry nodes | Gameplay semantics require naming/extras conventions | Heavy and less deterministic for this style | Landmarks only, if needed |
| LDtk | Entities can be free-placed, but product model remains level/layer/grid oriented | Entity definitions and reusable data | Good typed fields | Adds little over Tiled for road geometry | Reject as primary tool |

## Raw TS arrays

Advantages:

- Zero new dependency.
- Easy review for very small maps.
- Direct use of current types and colors.

Problems:

- A 500-unit map becomes hundreds or thousands of opaque literals.
- Moving a district requires recalculating every child coordinate.
- Repeated shed rows, lamp sequences, curb chains, and road markings remain duplicated.
- No deterministic generation or systematic clearance validation.
- A larger source file does nothing to fix runtime representation.

Keep current arrays only as a legacy input format.

## Typed macro/stamp DSL

This matches the project best:

- Roads become named centerline corridors with widths and markings.
- Districts place a small curated stamp with translation and rotation.
- Repetition is explicit and reviewable.
- Decoration uses a deterministic seed.
- Explicit exceptions remain visible.
- The compiler can generate rendering, collision, pavement, spawn metadata, and diagnostics from one source.

It also preserves the project’s code review and TypeScript workflow without introducing an external binary/editor dependency.

## Tiled

Documented facts:

- Tiled object layers support freely positioned, resized, and rotated rectangles, points, ellipses, polygons, polylines, and tile objects. [Tiled object layers](https://doc.mapeditor.org/en/stable/manual/objects/)
- Objects can carry custom properties. Layers can be grouped and locked. [Tiled layers](https://doc.mapeditor.org/en/stable/manual/layers/)
- Objects can be saved as reusable templates. [Tiled templates](https://doc.mapeditor.org/en/stable/manual/using-templates/)
- Infinite-map chunk records are primarily a tile-layer storage feature; they do not provide application-level streaming automatically. [Tiled JSON format](https://doc.mapeditor.org/en/stable/reference/json-map-format/)

Fit:

- Strongest external option for top-down road, collider, spawn, and district placement.
- Better than Blender for seeing gameplay clearances.
- Object coordinates, top-left rectangle origins, pixel-to-world scaling, rotation conventions, classes, and template inheritance all need a strict importer.
- It does not naturally express “repeat this corridor-side stamp every 28 units with deterministic exclusions.”
- It offers no accurate Three.js camera, shadows, fog, or building-height preview.

Recommendation: do not make Tiled canonical. If needed later, import Tiled object layers into the same canonical IR. Never make runtime code understand Tiled JSON.

## Blender/glTF

Documented facts:

- glTF nodes instantiate meshes with transforms, and its world-space unit convention is meters after node transforms. [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- Blender’s exporter can put custom properties into glTF `extras`. [Blender glTF exporter](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html)
- glTF is designed as a runtime asset-delivery format. Mesh primitives and materials map naturally to GPU-oriented buffers. [Khronos glTF](https://www.khronos.org/gltf/)

Fit:

- Excellent for one bespoke terminal, bridge, tower, or sculptural landmark.
- Poor as the authority for gameplay pavement and simple colliders.
- Encourages mesh/material proliferation and async asset loading.
- Collider extraction from object names or `extras` is possible but convention-heavy.
- Blender curves become meshes at export, losing the clean centerline/width representation needed for pavement tests and road regeneration.

Recommendation: permit optional landmark GLBs later, with separately authored simple colliders. Do not put the whole map in one GLB.

## LDtk

LDtk supports free world layout and entity layers with free placement, but its conceptual center remains levels, grid dimensions, IntGrid/tile layers, and entity instances. [LDtk worlds](https://ldtk.io/docs/general/world/), [LDtk layers](https://ldtk.io/docs/general/editor-components/layers/)

That is valuable for tile-based 2D games, but weaker than Tiled for arbitrary rotated road geometry and weaker than a DSL for parametric corridor systems. It does not solve a problem this project currently has.

---

# 3. Recommended workflow and canonical representation

## Authoring workflow

1. Author a `MapSource` in TypeScript.
2. Compose it from:
   - named corridors;
   - a few purpose-built districts/stamps;
   - landmarks;
   - explicit exceptions;
   - deterministic decoration rules.
3. Compile at build time.
4. Validate geometry, clearance, spawn safety, chunk capacity, and determinism.
5. Emit a versioned `CompiledMap`.
6. Runtime consumes only `CompiledMap`, never authoring macros.
7. Use a debug view to display pavement, colliders, chunk boundaries, spawn candidates, and batch counts.

The map source should remain readable enough to understand spatial intent. Do not turn it into a generic scene graph or mini game engine.

## Canonical intermediate representation

```ts
type CompiledMapV1 = {
  version: 1;
  id: string;
  sourceHash: string;

  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };

  environment: CompiledEnvironment;
  spawn: { x: number; z: number; heading: number };

  chunks: readonly CompiledChunk[];

  // Structure-of-arrays or tightly packed records:
  pavement: CompiledPavementIndex;
  obstacles: CompiledObstacleIndex;

  placement: {
    rearSpawnAreas: readonly CompiledArea[];
    noSpawnAreas: readonly CompiledArea[];
  };

  diagnostics: {
    counts: MapCounts;
    estimatedTriangles: number;
    estimatedBatchCount: number;
  };
};
```

Pavement primitives should initially be only:

- oriented rectangles;
- corridor capsule segments;
- join circles;
- optional simple convex polygons for explicit exceptions.

Obstacle primitives should remain AABBs unless a real map requires oriented solid buildings. The current player collision is a circle against AABB and works well with the game’s solid, readable silhouettes.

---

# 4. Targeted runtime architecture

## Source/compiler boundary

Suggested modules:

```text
maps/source/
  types.ts
  corridors.ts
  stamps.ts
  large-test-map.ts

maps/compiler/
  compile-map.ts
  compile-corridors.ts
  compile-stamps.ts
  build-spatial-index.ts
  validate-map.ts

maps/compiled/
  city-circuit.generated.ts
  crosswind.generated.ts
  switchyard.generated.ts
  large-test-map.generated.ts

world/
  build-world.ts
  render-batches.ts
  spatial-index.ts
  pavement-query.ts
  resource-owner.ts
```

The compiler is allowed to be expressive and allocate ordinary objects. The runtime representation should be boring and compact.

## Corridors

A corridor owns:

- centerline points;
- width;
- surface/material ID;
- marking pattern;
- join and end-cap policy;
- optional shoulder width.

Compilation produces:

- a continuous road strip mesh, clipped into chunks;
- capsule pavement records for each segment;
- circle records at joins;
- instanced or merged paint;
- bounds for spatial indexing.

A continuous strip eliminates overlapping road boxes, road-index height offsets, and hundreds of individual dash meshes.

## Districts and stamps

A stamp is a narrowly scoped authored composition, such as:

- freight row;
- service plaza;
- airport apron;
- civic block;
- roadside grove;
- boundary service gate.

It is not a generic prefab/actor system. A stamp expands into pavement patches, obstacle boxes, visual instances, placement exclusions, and annotations.

Every expanded item gets a stable ID such as `west-yard/shed-2`, allowing explicit changes without forking the stamp.

## Deterministic decoration

Use a fixed small PRNG with:

- map seed;
- district/stamp seed salt;
- stable candidate ordering.

Decoration rules should generate only nonessential visual objects by default. If a tree or barrier is collidable, it must explicitly emit both its visual and collider from the same rule.

Generation filters:

- outside pavement clearance;
- outside spawn and rear-placement clearance;
- outside authored `noDecoration` areas;
- minimum separation from other obstacles;
- inside boundary inset.

The same source and compiler version must emit byte-equivalent placement.

## Spatial index

Use a uniform 2D grid, not a tree or nav structure.

Recommended initial cell size: 32 units, benchmarked against 24 and 48.

At compilation:

- Insert each obstacle into every grid cell touched by its AABB.
- Insert each pavement primitive into every touched cell.
- Deduplicate candidate IDs during a query with a query-generation stamp or tiny local set.

At runtime:

```ts
world.queryCollision(position, radius)
world.isOnPavement(position)
world.isOutsideBoundary(position, radius)
world.findRearSpawn(player, formationIndex)
```

Typical queries should examine single-digit candidates rather than every item in the map. Complexity becomes dependent on local density, not world area.

## Rendering batches and chunks

Use static chunks around 64–96 units wide. Start at 80.

Within each chunk:

- merge continuous road surfaces per material;
- merge large paint strips where convenient;
- instance repeated trees, poles, barriers, and unit-box building parts;
- use a limited material palette;
- keep landmark GLBs separate only when genuinely unique.

Three.js documents `InstancedMesh` for repeated geometry and `BatchedMesh` for different geometries sharing a material; `BatchedMesh` also supports per-object frustum culling. [Three.js `InstancedMesh`](https://threejs.org/docs/pages/InstancedMesh.html), [Three.js `BatchedMesh`](https://threejs.org/docs/pages/BatchedMesh.html)

Recommended choice:

- `InstancedMesh`: identical geometry/prototype, including unit boxes transformed to varied dimensions.
- `BatchedMesh`: a small family of different static shapes sharing one material.
- Merged `BufferGeometry`: road strips and paint that never need independent transforms.

Do not use one global instance batch. A large global bounding volume weakens culling. Chunk-local batches provide useful bounds and bounded rebuild/disposal cost.

## Material and geometry ownership

Use two ownership levels.

Game lifetime:

- unit box, plane, cylinder, cone, curb, and pole geometries;
- shader/material templates;
- optional loaded landmark assets;
- palette-keyed materials with reference counting.

World lifetime:

- corridor strip buffers;
- merged paint buffers;
- chunk instance/batch buffers;
- spatial indices;
- map-specific material references;
- world root.

`WorldRuntime.destroy()` should:

1. Remove its root.
2. Dispose world-owned merged/batch/instance buffers explicitly.
3. Release shared catalog references.
4. Clear indices and typed arrays.
5. Never traverse and guess ownership.

## Transactional map switching

Build the next world before destroying the old one:

1. Resolve already-compiled map data.
2. Construct the new root off-scene.
3. Build its indices and batches.
4. Optionally precompile it through `renderer.compileAsync`.
5. Swap player and mode references while paused.
6. Add new root/remove old root in one transaction.
7. Dispose old world after the swap.

This briefly holds two map runtimes, but these maps should be small enough for that. It prevents blank or half-built frames and allows failure rollback.

Acceptance target:

- Warm switch build: under 50 ms on representative desktop, under 100 ms on target mobile.
- No long task over 50 ms where practical.
- No growth in `renderer.info.memory.geometries`, textures, or program count after ten A→B→A cycles.

---

# 5. Camera, fog, shadows, precision, and budgets

## Fog and camera range

Recommendation:

- Keep fog and camera distance based on readable driving distance, not map diameter.
- Suggested starting values:
  - Chase fog: near 120–160, far 210–260.
  - Isometric: near 110–150, far 220–280.
  - Side: far plane only as deep as required to see local scenery.
- Let regional landmarks emerge within those ranges; do not require visibility across the whole world.
- Give each district local silhouette and pavement identity so the player does not depend on one global tower.

A 1,000-unit-wide map can still use a 250-unit far plane because every camera follows the player.

## Player-centered shadows

Replace whole-map `shadowExtent` with a quality profile:

```ts
type ShadowProfile = {
  extent: number;       // e.g. 34–48 units
  mapSize: 1024 | 2048;
  casterRadius: number; // e.g. 55 units
};
```

Each frame, or when the player crosses a small threshold:

- Move the directional light and its target with the player.
- Snap the shadow center to shadow-texel increments to reduce shimmer.
- Keep a fixed orthographic extent.
- Enable shadow casting only for nearby chunks and vehicles.
- Let distant static scenery use lighting without dynamic shadows.

Capability tiers:

- Low: 1024², 30–36-unit extent, vehicles plus major nearby buildings.
- Medium: 1024² or 2048², 40-unit extent.
- High: 2048², 44–50-unit extent.

Do not enlarge the shadow camera to 400–700 units.

## Boundary readability

A fence at a distant square perimeter is insufficient once global landmarks disappear into fog.

Use a layered boundary language:

- a 10–15-unit ground-value warning band inside the terminal limit;
- larger repeated boundary posts or pylons visible through local fog;
- chunked fence rails/posts;
- sparse corner or sector landmarks;
- no invisible terminal boundary inside the visible warning system.

The collision remains the current constant-time square or rectangle test.

## Coordinate precision

No floating origin is needed.

At coordinates around 700, 32-bit floating-point spacing is roughly `0.00006` world units. That is far below the 1.25-unit vehicle radius and visible collision tolerance. High-precision shader floats are defined as IEEE 754 32-bit values in GLSL ES. [Khronos GLSL ES specification](https://registry.khronos.org/OpenGL/specs/es/3.2/GLSL_ES_Specification_3.20.html)

Also unnecessary:

- logarithmic depth;
- reversed depth;
- origin rebasing;
- double-precision world transforms.

Keep the near plane at 0.1 only if close camera geometry requires it; otherwise 0.2–0.3 would modestly improve depth precision.

## Mobile budgets

There is no universal Three.js or Safari draw-call number. These are design targets to verify on representative hardware:

| Metric | Initial target |
|---|---:|
| Main-pass draw calls | ≤100 ideal, ≤150 hard target |
| Shadow-pass caster draws | ≤50 ideal, ≤80 hard target |
| Visible main triangles | ≤100k ideal, ≤200k hard target |
| Shadow triangles | ≤50k ideal, ≤100k hard target |
| 60 Hz frame budget | 16.7 ms |
| 30 Hz fallback budget | 33.3 ms |
| Warm map switch | <100 ms target-mobile main-thread work |
| Map-switch memory drift | zero after repeated cycles |

Use adaptive pixel ratio. The current unconditional `min(devicePixelRatio, 2)` can still produce four times the fragment load of DPR 1.

Base graphics behavior on:

- renderer capabilities;
- viewport pixel count;
- observed frame times;
- optional GPU timer-query support;
- shadow and DPR quality tiers.

Avoid user-agent detection. A practical fallback sequence is:

1. Reduce DPR toward 1.25 or 1.
2. Reduce shadow map size/extent and caster distance.
3. Hide far decorative batches.
4. Disable secondary decorative shadows.
5. Only then consider a 30 Hz presentation mode.

## LOD and streaming

Recommendation: neither is required for the first 400–700-unit maps.

Chunk frustum culling, fog-distance visibility, and batching should be enough because:

- geometry is simple;
- textures are minimal or absent;
- world data is numeric and compact;
- only a local fraction of the map is visible;
- collision/pavement data can remain fully resident.

A distance visibility tier for paint and minor decoration is useful, but that is not a general LOD system.

Consider streaming only if measured compiled maps exceed a few megabytes, switch memory becomes problematic, or build-time landmark assets dominate. Do not preemptively build it.

---

# 6. Chase fairness without a navmesh

## Current assumptions

The pursuer:

- predicts the player by 0.32–0.38 seconds;
- smooths target observation;
- turns at a speed-dependent bounded rate;
- moves physically in substeps;
- detects obstacles only after contact;
- chooses one of two obstacle tangents;
- slows off pavement;
- rear-spawns from six candidate offsets;
- respawns when stuck or outside the boundary.

This behavior works because current maps use short convex obstacles, broad gaps, and no dead ends. Larger maps should preserve that level-design contract.

## Recommended improvements

### Predictive obstacle avoidance

Before advancing, sweep or sample the pursuer’s collision circle 4–10 units ahead using the same spatial index.

If a collision is predicted:

- reduce requested speed based on time to impact;
- choose the obstacle tangent most compatible with the target;
- smoothly blend toward that tangent;
- retain the existing physical collision response as the final authority.

This is local steering, not pathfinding. The car still has mass, turn limits, collision, and smoothing.

### Safe placement service

Move rear-placement validation into `WorldRuntime`:

```ts
findRearSpawn(
  player: PlayerSnapshot,
  formationIndex: number,
): { position: Vector3; heading: number } | null;
```

It should:

- use the generic rear/lateral candidate fan;
- reject obstacles, boundary margins, and `noSpawn` areas;
- optionally require pavement or a declared safe spawn area;
- require minimum player distance;
- never place ahead of the player;
- return `null` so reinforcement can be delayed.

### Useful semantic metadata

Keep only:

- pavement versus rough ground;
- terminal obstacle bounds and kind;
- rear-spawn areas;
- no-spawn areas;
- spawn clearance radius;
- optionally `noDecoration`/recovery areas used by the compiler.

Do not build:

- a navmesh;
- lane graph;
- waypoint network;
- route costs;
- district-to-district planning;
- police coordination;
- scripted intercept routes;
- map-specific speed or accuracy modifiers.

If a pursuer repeatedly fails around an obstacle, first shorten the obstacle, enlarge its bypass, or remove concavity. The existing design files already follow this principle.

## Large-map fairness risks

- Long straight corridors could make pursuit monotonous. Fix spatial rhythm rather than adding speed rubber-banding.
- Huge open fields could make direct pursuit trivial and noninteractive. Use sparse district structure and alternate crossings.
- Rear spawning near a remote boundary will fail more often if only fixed offsets are tested. Safe spawn areas and delayed activation solve this.
- Fog can hide a newly spawned pursuer. Retain capture grace and require a minimum visible/temporal setup.
- Repositioning must remain a recovery mechanism, never a tactical ambush.

---

# 7. Proposed TypeScript authoring API

This example treats `halfExtent: 500` as a map whose current-style `worldLimit` is 500, or 1,000 units across.

```ts
export const HIGH_PLAINS = defineDrivingMap({
  id: "high-plains",
  title: "High Plains",
  description: "Long freight corridors, service districts, and open reversals.",

  bounds: { halfExtent: 500 },
  seed: 0x48a2d11,

  environment: {
    background: 0xc7ddd7,
    ground: 0x80785d,
    road: 0x434743,

    // Local viewing values, not derived from map diameter.
    fog: { near: 145, far: 245 },
    cameraFar: 280,
    shadows: { extent: 40, casterRadius: 54 },
  },

  corridors: [
    corridor("west-spine", {
      width: 18,
      points: [
        [-390, -330],
        [-330, -170],
        [-350, 20],
        [-285, 205],
        [-160, 350],
      ],
      markings: "center-dash",
    }),

    corridor("east-spine", {
      width: 20,
      points: [
        [230, -360],
        [315, -210],
        [285, -20],
        [345, 175],
        [250, 355],
      ],
      markings: "edge-dash",
    }),

    corridor("crosswind-link", {
      width: 16,
      points: [
        [-320, -90],
        [-120, -25],
        [80, 35],
        [300, 105],
      ],
      markings: "taxiway",
    }),

    corridor("southern-cut", {
      width: 10,
      points: [
        [-360, -280],
        [-90, -315],
        [210, -285],
      ],
      surface: "worn",
    }),

    corridor("north-sweeper", {
      width: 22,
      points: arcPoints({
        center: [20, 235],
        radius: 170,
        start: Math.PI * 0.12,
        end: Math.PI * 0.92,
        segments: 12,
      }),
    }),
  ],

  districts: [
    placeStamp("west-freight", freightRow({
      sheds: 5,
      shedSize: [14, 26],
      gap: 18,
      palette: "warm-freight",
    }), {
      at: [-245, 40],
      heading: -0.18,
    }),

    placeStamp("east-service", serviceYard({
      apron: [120, 95],
      buildings: "staggered",
      inspectionPads: 2,
    }), {
      at: [255, -95],
      heading: 0.26,
    }),

    placeStamp("north-reversal", openReversal({
      radius: 54,
      edgeBarriers: 4,
    }), {
      at: [-85, 340],
      heading: Math.PI / 2,
    }),
  ],

  landmarks: [
    tower("orange-tower", {
      at: [-170, 285],
      size: [10, 10, 28],
      color: 0xd0643f,
    }),

    hangar("south-hangar", {
      at: [90, -340],
      size: [42, 22, 10],
      heading: -0.12,
      color: 0x6d8b87,
    }),
  ],

  decoration: [
    scatterTrees("west-windbreak", {
      seedSalt: "windbreak",
      area: rect(-455, -80, 55, 520),
      spacing: [18, 27],
      pavementClearance: 9,
      obstacleClearance: 8,
      density: 0.58,
    }),
  ],

  exceptions: [
    omit("west-freight/shed-3"),
    place(barrier("shortcut-gate-a", { at: [-42, -311] })),
    place(barrier("shortcut-gate-b", { at: [18, -303] })),
    pavementPatch("service-apron-extension", {
      center: [210, -55],
      size: [48, 34],
      heading: 0.26,
    }),
  ],

  spawn: {
    at: [-370, -315],
    heading: 0.4,
    clearance: 10,
  },

  chasePlacement: {
    rearSpawnAreas: [
      corridorBand("west-spine", { inset: 4 }),
      corridorBand("east-spine", { inset: 4 }),
      rectArea(-180, -360, 360, 80),
    ],
    noSpawnAreas: [
      stampArea("north-reversal"),
      circleArea([-170, 285], 24),
    ],
  },
});
```

This API is intentionally limited:

- no generic entities;
- no behavior components;
- no actor inheritance;
- no script callbacks embedded in map content;
- no runtime procedural roads;
- no navigation graph.

---

# 8. Phased migration

## Phase 0: establish measurements

Add debug instrumentation without changing rendering.

Measure:

- `renderer.info.render.calls`;
- main and shadow triangle counts;
- active geometry/program counts;
- world build/destroy duration;
- first-frame cost after switch;
- per-frame collision candidates/tests;
- pavement candidates/tests;
- pursuer low-speed/collision episodes;
- fixed-spawn or failed-spawn rate;
- frame-time median, p95, and p99 by camera;
- DPR, viewport pixels, shadow tier, and device capability values.

Acceptance:

- Baselines captured for all 3 maps × 3 cameras × Cruise/Chase.
- Ten alternating map switches show no monotonically increasing resources.

## Phase 1: compatibility compiler

Create a `compileLegacyMap(GameMapDefinition)` adapter.

Current maps remain unchanged but are compiled into:

- chunk records;
- pavement primitives;
- obstacle arrays;
- spawn/environment data.

Keep old rendering initially.

Acceptance:

- Spawn positions/headings identical.
- Boundary outcomes identical.
- At least 100,000 deterministic sampled pavement points match current results, excluding explicitly documented circuit tolerance changes.
- Collision results match for current nonoverlapping obstacles.
- Current maps remain selectable and visually unchanged.

## Phase 2: spatial indices and ownership

Replace flat scans with the uniform-grid indices. Introduce explicit world resource ownership and call instance/batch disposal correctly.

Acceptance:

- Typical collision query examines under 12 obstacle candidates.
- Pathological query examines under 40 on existing maps.
- Pavement queries are independent of total map size.
- Ten A→B→C switch cycles have stable renderer memory counts.
- Chase capture and reset behavior remains unchanged in normal playtests.

## Phase 3: batching

Convert:

- road paint;
- parking paint;
- barriers;
- trees;
- streetlights;
- common building parts;
- boundary segments.

Then replace road boxes with compiled corridor strips for new maps.

Acceptance:

- Circuit City main-pass draw calls below 150 in representative views.
- Shadow caster calls below 80.
- No visible collision/visual disagreement above 0.15 units.
- No paint z-fighting at intersections.
- Mobile Safari meets the agreed frame-time tier.

## Phase 4: DSL and validation

Build corridors, stamps, deterministic decoration, stable IDs, exceptions, and compiler diagnostics.

Acceptance:

- Identical seed/source emits identical compiled output.
- Invalid spawns, out-of-bounds objects, bad exception IDs, nonfinite coordinates, batch overflow, and inadequate declared clearances fail compilation.
- Generated maps have a human-readable diagnostics summary.
- Current maps can gradually migrate without removing legacy support.

## Phase 5: first large-map vertical slice

Build only one 500-half-extent map sector first:

- two long corridors;
- one crossing;
- one freight district;
- one open reversal;
- one landmark;
- one deterministic decoration band;
- one explicit shortcut exception.

Then expand the same map to full size.

Acceptance:

- Full map remains resident.
- Warm switching remains under 100 ms on target mobile.
- Main draw calls and spatial-query candidate counts remain close to the one-sector version.
- No frame-time growth proportional to total map area when the same local scene is visible.
- Chase spends under 2% of active time below 3 m/s while more than 12 m from the player.
- Reinforcement placement failure remains below 1%.
- Fewer than 10% of captures occur within two seconds after spawn grace.
- Players can identify their district and two possible continuations without a minimap.

## Phase 6: external-editor decision gate

Only consider Tiled after two DSL-authored large maps.

Adopt it only if measured evidence shows:

- coordinate editing dominates iteration time;
- nonprogrammer level authors need direct manipulation;
- most changes are individual placement rather than parametric layout;
- a Tiled importer can remain a source adapter to the same compiler.

Do not replace the canonical IR.

---

# 9. Final decision, rejected alternatives, risks, and vertical slice

## Final decision

Adopt:

- code-first typed map DSL;
- build-time canonical compilation;
- 80-unit static chunks;
- chunk-local merged/instanced/batched rendering;
- uniform-grid collision and pavement indices;
- explicit two-level resource ownership;
- player-centered fixed-size shadows;
- transactional in-place world switching;
- deterministic decorative generation;
- safe rear-placement metadata;
- predictive local Chase avoidance.

Keep full maps resident. Do not stream.

## Rejected alternatives

- **Bigger raw arrays:** maintainability and batching problems remain.
- **Tiled as canonical:** good placement UI, insufficient payoff for parametric corridors and generated districts today.
- **LDtk:** too grid/level-oriented for this map grammar.
- **Whole-map Blender/glTF:** excessive authoring/runtime coupling and weak collider/pavement authority.
- **One giant merged world mesh:** good draw count, poor culling, ownership, diagnostics, and selective shadow control.
- **Global instance batches:** weak spatial culling.
- **Navmesh or waypoint network:** unnecessary for three physical direct-seeking cars and hostile to the desired simplicity.
- **Streaming/infinite procedural terrain:** no measured need and significant lifecycle complexity.
- **Full geometric LOD:** low-poly silhouettes do not justify it.

## Major risks

1. **Compiler complexity becomes its own engine.**  
   Keep the primitive set closed and driving-specific.

2. **Stamp reuse creates visual repetition.**  
   Use a small number of authored variants, palette changes, and deterministic omissions—not uncontrolled random clutter.

3. **Batching weakens per-object culling or shadows.**  
   Keep batches chunk-local and maintain separate nearby shadow-caster visibility.

4. **Road compilation creates bad joins.**  
   Start with bevelled polyline joins and sampled arc helpers; reject self-intersecting or too-sharp corridors at compile time.

5. **Visual and collision geometry diverge.**  
   Emit both from the same compiled item and validate bounds overlays.

6. **Large open distances weaken Chase.**  
   Solve with district rhythm, crossings, and local predictive avoidance, not teleportation or map-specific speed bonuses.

7. **Switching peaks memory.**  
   Measure the two-world overlap. If it becomes material, dispose the old world immediately after new CPU construction but before optional GPU prewarming.

## First vertical slice

The first implementation slice should not be “build the full 500-unit map.” It should prove scale independence:

1. Legacy-map compiler adapter.
2. Uniform collision/pavement grid.
3. Explicit resource owner.
4. Chunk-batched road surface, road markings, one building style, and barriers.
5. Player-centered 40-unit shadow volume.
6. One 160×320-unit authored sector made from:
   - two angled corridors;
   - one curved connection;
   - one freight-row stamp;
   - one tower;
   - one deterministic tree band;
   - one explicit shortcut gate.
7. Switch repeatedly between that sector and Circuit City.
8. Run one and three pursuers through it on mobile Safari.

If visible draw calls, frame time, collision candidates, and map-switch cost stay approximately constant when the sector is duplicated into a 500-half-extent world, the architecture is proven. If they grow with total area, fix chunk activation/batching before authoring more content.