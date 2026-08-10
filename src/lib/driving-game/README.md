# Driving game architecture

The driving game is split along the things that can vary independently:

- `runtime.ts` — renderer and DOM lifecycle, responsive display/input capabilities, cameras, mode wiring, drive timing, and the frame loop.
- `driving-profiles.ts` — internal handling presets used while tuning.
- `audio/` — car-audio orchestration plus procedural engine and tire AudioWorklet sources.
- `core/` — deterministic control timing and the numeric world-query contract used by vehicle mechanics.
- `simulation/` — all production handling state and deterministic time-step mechanics, with detached authoritative snapshots and presentation-frame output.
- `session/` — offline session composition; the browser runtime depends on this boundary rather than constructing a player controller directly.
- `player/` — thin compatibility adapter exposing the stable player API plus the separate Three.js/audio/effects presentation observer.
- `vehicle/` — player-car construction, drift smoke, and skid marks.
- `feedback/` — inexpensive screen-space gameplay feedback such as redline speed lines.
- `world/` — map construction, circuit geometry, buildings, props, visible perimeter fencing, and collision bounds.
- `local-leaderboard.ts` — persistent local drive results and future command-facing queries.
- `maps/` — world geometry, environment settings, pavement, spawn, and boundaries.
- `modes/` — rules, mode-specific actors, lifecycle, and presentation copy.
- `multiplayer/` — production `GameSimulation`, bounded GameNet payload codec, fixed first-release composition, deterministic spawn/collision ownership, hosted/joined Direct Invite sessions, snapshot interpolation, browser runtime, and render-only remote vehicle fleets.
- `types.ts` — launch options and shared runtime state names.
- `design.md` — experiential north star.

The local frame path is now `runtime → LocalDrivingSession → DrivingVehicleSimulation → PlayerPresentation`. The simulation exclusively owns position, velocity, heading, controls, drift phases, boost, collision response, and time-step updates as plain numeric state. Control double taps use simulation time rather than `performance.now()`, and world access crosses a numeric `DrivingWorldQuery`. `PlayerController` only adapts detached simulation snapshots to the legacy Three.js-facing API and forwards presentation frames. The mechanics therefore run headlessly with no Three.js state, scene, audio, effects, DOM, or browser clock. This is the boundary an authoritative multiplayer simulation can consume; single-player still owns its existing cameras, modes, HUD, audio, and effects.

`../driving-game.ts` is the stable public entry point used by the Astro page. `/drive/dyno/` is a hidden, `noindex` tuning surface that runs the same procedural car-audio and transmission code against synthetic speed, throttle, drift, braking, reverse, and boost inputs. It exposes live transmission parameters, per-transition full-shift toggles, telemetry, a logarithmic spectrogram, persistent tuning JSON, and a copyable event log without shipping any reference recordings.

## Launching a combination

```ts
startDrivingGame(root, {
  mode: "cruise",
  map: "city-circuit",
  drivingProfile: "loose",
});
```

The page exposes Cruise and Chase plus Circuit City, Crosswind, Switchyard, the 1,000-unit-wide High Plains, the 900-unit-wide Metro Ring, and the 760-unit-wide Northpoint before play and while paused. Mode changes replace only the mode controller; map changes transactionally build the next world before disposing the previous one while retaining the renderer, controls, player presentation, and page lifecycle. The runtime derives touch capability and orientation from browser capabilities and container geometry rather than user-agent strings, and pauses safely when an active drive rotates. Automatic controls remain the default. On fine-pointer desktops, entering Up, Up, Down, Down, Left, Right, Left, Right before play or while paused unlocks the persisted Manual scheme and its hidden selector. Cruise defaults to the `loose` profile; Chase defaults to `aggressive`. Passing `drivingProfile` explicitly overrides the mode default for tuning.

Available internal handling profiles are `balanced`, `loose`, `technical`, and `aggressive`. Aggressive raises acceleration and top speed, uses faster and deeper breakaway behavior, strengthens hard-drift entry and exit boost, and reaches redline at the end of its final pull. The other profiles keep a quieter final ratio without lowering RPM merely because the speed cap was reached. The audio-only transmission uses four high-torque sequential ratios and fully punctuates all three upshifts. Initiating a drift requests one immediate rev-matched downshift with a short procedural exhaust bark and engagement thump when a lower ratio is available; recovery briefly inhibits shifts, and braking or multi-stage changes reconcile without an upshift thump. No default transition is hidden or absorbed. A 320 ms re-arm, 6% downshift hysteresis, dedicated worklet torque-cut envelope, and mostly longitudinal speed reference prevent threshold chatter. Player resets and reverse engagement return it silently to the launch stage.

## Adding a map

Small legacy maps may still provide a direct `GameMapDefinition`. New large maps should use the driving-specific helpers in `maps/authoring.ts`:

1. Define named polyline corridors with widths, surfaces, optional markings, and an optional `junctionScale`. The compiler splits crossing segments, trims every approach, merges overlapping junction envelopes, builds a convex junction polygon from the cut road edges, and suppresses markings through the intersection. Deliberate terminal roads can opt into `allowDeadEndStart` or `allowDeadEndEnd`.
2. Place narrowly scoped freight, service, civic, shopping, construction, container, settlement, or reversal stamps with `placeAlongCorridor()`. Distance, side, setback, entrance width, multiple entrance offsets, and optional relative rotation replace manually synchronized world coordinates.
3. Add a few explicit landmarks and exceptions.
4. Generate only sparse decoration with a stable seed and pavement clearance.
5. Register the resulting definition in `maps/index.ts`; both selectors come from `GAME_MAPS`.
6. Keep mode-specific entities and rules out of map sources.

The authoring compiler validates bounds, finite corridor coordinates, unique IDs, minimum segment length, ground coverage, and spawn placement. Its deterministic parcel solver retries nearby positions, rejects district, landmark, and non-host-road overlap, reserves footprints, aligns stamps to the road tangent, and emits paved entrance throats. Stamps may include internal access lanes; barriers in circulation paths and parking markings beneath buildings, corridors, entrances, or access lanes are removed automatically. Freight, service, civic, retail, container, and construction stamps add sparse loading-bay markings and two-sided color-coded pictogram signs, while parking aprons receive a muted shoulder band that separates working pavement from grass without adding texture noise. Runtime corridor strips, junctions, capsule pavement primitives, and markings all derive from the same source. `DEFAULT_GAME_MAP_ID` owns the no-query default, while `isGameMapId()` validates direct `?map=` launches against the registry.

Metro Ring is the contrasting second large map: a denser beltway, cross-city avenues, industrial cuts, civic blocks, shopping areas, and container yards prove the source format beyond High Plains' freight-country grammar. Northpoint was authored entirely through the established corridor and roadside-district API; its suburban retail, civic, service, construction, container, and residential blocks act as a no-new-abstractions regression map. High Plains is the first large-map vertical slice. Its 500-unit half-extent is more than three times Circuit City's linear playable scale. Eleven connected corridors form several cross-map loops around road-relative freight, service, and reversal districts. Regional landmarks, roadside lighting, field-value patches, and deterministic groves keep the large world locally legible while it remains fully resident without streaming.

Static props and markings are instanced in spatial batches. A 32-unit uniform grid makes obstacle and pavement query cost depend on local density instead of total map area, and `WorldRuntime.getDiagnostics()` exposes build and candidate counts. Launching with `?debug=map` shows a hidden live overlay for draw calls, triangles, build time, resource counts, coordinates, and average spatial-query candidates. Number keys toggle pavement bounds (`1`), colliders (`2`), occupied spatial cells (`3`), corridor source lines (`4`), and compiled district footprints (`5`). Left and right brackets cycle a frozen inspection camera through every district entrance; backslash returns to normal driving. The overlay identifies the district, host corridor, and entrance count alongside connected components, intentional and unintended dead ends, cycle rank, short source segments, acute intersections, maximum decision spacing, disconnected entrances, compiled junctions, and district entrances. Layout warnings remain diagnostics rather than a generic city-generator policy so unusual maps can deliberately opt out. Player-centered, texel-snapped shadow coverage stays at a maximum 48-unit half-extent regardless of map size; fog and camera range likewise remain local. The renderer derives a pixel ratio from viewport area and a fixed pixel budget rather than user-agent detection.

Switchyard still uses one broad freight apron and two staggered rows of short sheds. Its three longitudinal channels create delayed lane-transfer and double-transfer decisions without map-specific pursuit behavior. Subtle pavement bands, inspection pads, and the visual-only `freight` building style establish lane and yard identity.

Run `pnpm run test:drive` for compiler fixtures covering right-angle crossings, shared junctions, overlapping junction envelopes, parcel fallback, multiple entrances, internal circulation, and intentional dead ends.

A map owns:

- world and ground dimensions;
- environment colors, fog, camera range, and shadow coverage;
- road segments, continuous corridors, and parking lots used by indexed pavement detection;
- transformed district stamps, buildings, trees, and barriers;
- optional semantic circuit grammar;
- player spawn.

Every map receives a lightweight visual fence at `worldLimit`. The car's paired-circle footprint reaches that fence as its center enters the existing boundary-reset zone, so the visible perimeter and terminal boundary remain spatially consistent without adding fence obstacles.

Every registered mode receives the selected map and its built `WorldRuntime` service. The service owns pavement, obstacle, safe Chase placement, spawn, and boundary queries so player and pursuit actors share one spatial truth. Optional preferred and prohibited placement areas bias reinforcement retries toward fair paved positions without introducing navigation data. Its `destroy()` method removes and disposes all map-owned scene resources during an in-place map change.

## Local drive leaderboard

A drive timer advances only while gameplay is running and unpaused. Building collisions, world-boundary exits, manual resets, and mode-requested resets end the current drive and persist its duration in `localStorage`. Results include the selected mode, map, handling profile, control scheme, end reason, and timestamp; old records migrate as Automatic, Automatic and Manual leaderboards remain separate, the longest drives sort first, and storage is capped at 100 entries.

A future command can import `getLocalDriveLeaderboard` from the public `driving-game.ts` facade. It supports mode, map, profile, and result-count filters. `clearLocalDriveLeaderboard` is also exported for a future reset command. Trees, barriers, and streetlights are terminal collision obstacles: hitting one resets the car and records the completed drive alongside building and boundary failures.

## Adding or implementing a mode

1. Add a `GameModeDefinition` under `modes/`.
2. Register it in `modes/index.ts`.
3. Implement its controller lifecycle: `start`, `update`, `isDriveClockRunning`, `pause`, `reset(reason)`, `onPlayerEvent`, and `destroy`.
4. Put mode-owned entities, pursuit state, win/loss rules, escalation, and mode HUD adapters in that controller—not in maps or player handling.

The cruise controller is intentionally idle. Chase is a longest-survival mode with up to three escalating police pursuers, physical-collision capture, a brief post-capture state, pursuit pressure, and a compact survival timer. From 30–45 seconds, pursuit accuracy ramps modestly through faster target observation, slightly stronger prediction, and a small turn-rate increase without adding speed or removing close-range steering limits. Rear placement now tries a broader generic candidate fan and delays activation when no safe position exists; pursuers that remain slow or repeatedly collide while away from the player can reposition behind them with brief capture grace. `/drive/` remains Cruise by default; use `/drive/?mode=chase` to launch the Chase composition directly.

A mode controller receives the world service, a refreshed player snapshot with detached position and velocity vectors, elapsed drive time, typed collision and drift-phase events, and a mode-owned `endDrive` action. Its `isDriveClockRunning()` hook excludes non-playing states such as Chase's capture presentation from the recorded survival time. Session resets arrive once through `reset(reason)`. It can add objects to the shared scene without reaching into or mutating player internals. It should not fork the shared vehicle model unless a mode genuinely requires different handling; use a driving profile for deliberate handling experiments.
