# Crosswind — Chase map design

Research and design proposal generated after reviewing the driving-game feel specification, source research, current map schema, and Chase implementation.

## 1. Map proposal: Crosswind

**Fantasy:** Escape across an abandoned desert flight-test field, throwing jet-sized drifts around hangars and forcing police to commit to the wrong arm of a crossed taxiway.

Crosswind should be the opposite of Circuit City: two broad, asymmetric handling spaces connected by a bow-tie of competing routes—not a street grid, prescribed lap, or featureless arena.

---

## 2. Research findings

### Sourced evidence

- The original PAKO presents pursuit as a closed-area survival problem and differentiates numerous locations, including an airport and arena, while supporting both isometric and chase cameras. Contemporary coverage describes automatic acceleration, themed obstacle placement, escalating police, short runs, and maps that demand different avoidance strategies. [Official PAKO listing](https://apps.apple.com/us/app/pako-car-chase-simulator/id903183877), [TouchArcade review](https://toucharcade.com/2014/08/22/pako-car-chase-simulator-review/)

- Burnout Paradise’s developers treated the landscape itself as the game. Events permitted different routes, and developers specifically recalled a rhythm of selecting shortcuts while maintaining uninterrupted flow. [Burnout Paradise developer retrospective](https://www.gamedeveloper.com/design/devs-reflect-on-the-impact-and-legacy-of-i-burnout-paradise-i-)

- Criterion acknowledged that Paradise was not ideally laid out for very fast driving. For Hot Pursuit, it instead designed a compressed road network around the visual and spatial demands of extremely fast cars. [Criterion’s Matt Webster interview](https://www.ea.com/en-gb/news/hot-pursuit-interview-criterion-matt-webster)

- Track-design analysis connects greater road width with reduced lateral demand and more correction space. Conversely, a line offering less correction space can provide greater advantage if executed successfully. [A Rational Approach to Racing Game Track Design](https://www.gamedeveloper.com/design/a-rational-approach-to-racing-game-track-design)

- Players have less capacity to analyze environments under stress. Strong asymmetry, distant landmarks, and a simple block plan help players answer “Where am I?”, “Where should I go?”, and “How do I get there?” [Multiplayer Level Design: The Rules of Map Design](https://www.gamedeveloper.com/design/multiplayer-level-design-in-depth-part-2-the-rules-of-map-design). Insomniac similarly found that unique landmarks and gateways helped orientation in free-roaming spaces. [Lessons in Color Theory for Spyro](https://www.gamedeveloper.com/art/lessons-in-color-theory-for-i-spyro-the-dragon-i-)

- Camera FOV and distance directly determine the world-space area visible in-frame; there is no independent “level readability” solution once the camera is very close. [Unity’s frustum documentation](https://docs.unity3d.com/cn/2018.3/Manual/FrustumSizeAtDistance.html)

### Design inferences for this game

These are my conclusions, not claims made by those sources:

- Borrow PAKO’s compact identity and pursuit pressure, but not its extreme obstacle lethality or clutter. This game needs room to shape a slide and recover.
- Every major approach should expose at least two readable continuations. Route choice must happen through steering and momentum, without a minimap or route prompt.
- Broad areas should not be uniformly safe. They need isolated, legible shapes that turn empty pavement into driftable loops.
- A shortcut should save distance by reducing correction space—not through a hidden boost, surface modifier, or scripted event.
- With the current 5–5.5 m chase camera and roughly 60–66° FOV, entrances should be understandable from approximately 20–25 m away. This is a project-specific starting metric derived from [runtime.ts](../runtime.ts), not a universal rule.
- Direct-seeking police need convex obstacles, generous bypasses, and no pockets. Complexity should come from interception angles, not pathfinding failure.

---

## 3. Core spatial idea

Crosswind is a **two-lobed bow-tie**:

- A western apron contains one central hangar with a generous drift ring.
- An eastern apron contains two offset service buildings, producing an S-shaped infield choice.
- Two 18 m diagonal taxiways cross between the aprons.
- A shorter 9 m southern service lane provides the high-risk shortcut.

The repeatable survival loop is:

1. Sweep around a landmark in one apron.
2. Read which taxiway the pursuers are occupying.
3. Cross on the other diagonal—or risk the shorter service lane.
4. Enter the opposite apron carrying lateral momentum.
5. Choose an outside sweeper, infield slot, reversal, or immediate recross.

It supports figure-eights, alternating transitions, single-lobe donuts, high-speed apron circuits, and improvised free-drive lines. Crucially, its “loop” is a decision pattern rather than a mandatory course.

---

## 4. Top-down plan

All dimensions are approximate world metres.

```text
                              NORTH +Z

                    [22 m orange control tower]
                              (0, 34)

       WEST APRON                                     EAST APRON
        70 × 82                                        70 × 82
   x -90 ........ -20                            x 20 ........ 90
   z -41 ........  41                            z -41 ....... 41

      spawn ↑
     (-80, 0)            \  upper taxiway  /        [long hangar]
                         \      18 m       /          (55, 10)
       ┌──────────┐       \              /        ┌──────────────┐
       │          │        \            /         │              │
       │  WEST    │         \    X     /          │ east infield │
       │ HANGAR   │          \        /           │     slot     │
       │ (-55,0)  │          /        \           │              │
       │          │         /          \          └──────┐       │
       └──────────┘        / lower       \          service block│
                          / taxiway       \           (62,-17)   │

       ================= SOUTH SERVICE CUT =================
             two 4 m effective gates; 9 m total pavement
                              z -31

                         28 m+ recovery ground
                         before world boundary
```

Key dimensions:

- Overall active paved footprint: approximately 180 × 90 m.
- Western hangar ring: 26–28 m clear pavement on every side.
- Main taxiways: 18 m nominal width; roughly 15.5 m usable center clearance against any obstacle.
- East infield slot: 14 m geometric gap, approximately 11.5 m center clearance after the player’s 1.25 m collision radius.
- Southern shortcut: 9 m pavement, narrowed by paired barriers to about 6.5 m geometric/4 m center clearance at two gates.
- No blind wall longer than 26 m.
- No dead end or concave obstacle pocket.
- At least 28 m of nonterminal recovery ground separates primary pavement from the world boundary.

---

## 5. Coordinate-level blueprint

### Required schema extension

Add `rotation?: number` in radians to `RoadSegmentDefinition`. Rendering rotates the road mesh around Y; pavement testing transforms the query point into that road’s local coordinates before applying the existing rectangle test.

This is the smallest extension that makes the bow-tie possible. Roads remain noncolliding, so obstacle collision code is unaffected. Rotated roads should initially use `markings: false`, avoiding changes to the current axis-aligned marking generator.

```ts
const CROSSWIND_MAP = {
  id: "crosswind",
  title: "Crosswind",
  description: "Twin airfield aprons, crossed taxiways, and one dangerous service cut.",
  worldLimit: 118,
  groundSize: 280,

  environment: {
    background: 0xc7ddd7,
    grass: 0x9b855f,       // dry ochre ground
    road: 0x454947,        // cool charcoal pavement
    fogNear: 140,
    fogFar: 235,
    cameraFar: 285,
    sideCameraFar: 245,
    shadowExtent: 122,
    shadowFar: 195,
  },

  roads: [
    // Broad recovery/drift lobes
    { x: -55, z: 0, width: 70, depth: 82, markings: false },
    { x:  55, z: 0, width: 70, depth: 82, markings: false },

    // Crossed decision routes
    { x: 0, z: 0, width: 132, depth: 18, rotation:  0.35, markings: false },
    { x: 0, z: 0, width: 132, depth: 18, rotation: -0.35, markings: false },

    // Shortest but least forgiving connection
    { x: 0, z: -31, width: 112, depth: 9, markings: false },
  ],

  parkingLots: [
    // Primarily paint/texture landmarks; both overlap apron pavement
    { x: -74, z:  25, width: 18, depth: 12 },
    { x:  73, z: -24, width: 20, depth: 12 },
  ],

  buildings: [
    // West lobe orbit anchor
    { x: -55, z: 0, width: 18, depth: 26, height: 9, color: 0xd5c39b },

    // East lobe's asymmetric S decision
    { x: 55, z: 10, width: 24, depth: 12, height: 7, color: 0x758e88 },
    { x: 62, z: -17, width: 10, depth: 14, height: 5, color: 0xc97952 },

    // Distant north-reference landmark, outside primary driving lines
    { x: 0, z: 34, width: 9, depth: 9, height: 22, color: 0xd65b37 },
  ],

  barriers: [
    // Two consecutive shortcut gates
    { x: -12, z: -34.6 }, { x: -12, z: -27.4 },
    { x:  12, z: -34.6 }, { x:  12, z: -27.4 },
  ],

  trees: [],
  streetlights: [],

  spawn: { source: "position", x: -80, z: 0, heading: 0 },
};
```

Spawn heading `0` points toward `+Z`. The current reinforcement formation then initially places pursuers near:

- `(-80, -17)`
- `(-72, -30)`
- `(-88, -38)`

All three positions fit on the western apron and avoid the hangar.

### Collision and readability

- Preserve the existing 1.25 m player/pursuer world-collision radius.
- Buildings and barriers remain terminal for the player; therefore each is a large, isolated silhouette rather than roadside clutter.
- Keep every unintended paved choke at least 11.5 m in effective center clearance.
- The shortcut’s 4 m effective gates are the only deliberate near-car-width tests.
- The north tower should not cast a shadow across the central X; that would make the crossing appear obstructed.
- If bespoke airfield silhouettes are desired later, add optional `BuildingDefinition.style?: "standard" | "hangar" | "tower"`. It should change only mesh construction, never collision bounds. The graybox does not depend on it.

The current schema and pavement/collision split are visible in [types.ts](types.ts) and [build-world.ts](../world/build-world.ts).

---

## 6. Authored chase situations

| Situation | Player decision |
|---|---|
| **West hangar orbit** | Hold a fast 26 m-radius sweeper, reverse direction with a hard drift, or leave before a second pursuer cuts across the hangar’s far end. |
| **The central X** | Commit early to one diagonal, delay and cross behind a pursuer, or transition through the overlap. Early commitment preserves speed but exposes the chosen exit. |
| **Wrong-runway feint** | Enter one taxiway, then cut across the broad central overlap onto the other. The cost is a larger transition and lost momentum; the reward is making direct seekers overshoot. |
| **East infield slot** | Thread the 11.5 m effective gap for the shortest lobe reversal, or use a 22 m-wide outside arc that preserves recovery space but allows police to converge. |
| **South service cut** | Save roughly 15–20 m of travel through two 4 m gates, or take a diagonal with enough width for a full drift. With multiple pursuers, the shortcut can become physically occupied. |
| **Apron cutback** | In either open lobe, maintain an outside sweeper or abruptly rotate toward the infield. The pursuer’s 0.32 s prediction rewards a late cutback but punishes indecisive weaving. |
| **Three-car pincer** | At 45 seconds, identify whether the third pursuer has sealed a connector. Stay in the current lobe and risk compression, or cross near one police car before all three align. |

---

## 7. Police interaction and fairness

The existing pursuers predict briefly, steer directly toward the observed target, slow off pavement, and slide tangentially after obstacle contact. They do not plan routes or coordinate formations. See [pursuer.ts](../modes/chase/pursuer.ts).

### Geometry interaction

- The crossed routes create interception without requiring navigation logic.
- Isolated buildings make a pursuer choose a visible side through collision avoidance; there are no courtyards or U-shapes.
- Short obstacle faces limit wall-sliding. A police car striking the midpoint of the largest hangar is never more than approximately 13 m from an end.
- Recovery ground is deliberately off-pavement. A player can escape onto it, but the speed penalty lets the pursuing car compress distance.
- The southern shortcut becomes self-balancing: it is fastest while empty and progressively less attractive as police occupy it.

### Anti-latching and anti-stuck

The map removes the primary causes—long walls, concavities, and narrow dead ends—but I would add one generic failsafe:

- If a pursuer remains below 3 m/s for 1.25 seconds while more than 12 m from the player, or records three world collisions within 1.5 seconds, run `resetBehind`.
- Return a `respawned` flag and grant 0.8 seconds of capture grace.
- Do not respawn if the pursuer is slow because it is already in vehicle contact.

This is much cheaper than a navmesh and improves every map.

### Spawn fairness

- Retain the current 1.8-second opening grace and 1.35-second reinforcement grace.
- Expand the rear-spawn candidate list with lateral offsets of `±12 m`.
- Require a candidate to be obstacle-free, inside the boundary, and at least 14 m from the player.
- If none qualifies, delay that reinforcement by 0.5 seconds instead of falling back immediately to the fixed map spawn.
- Never spawn ahead of the player merely because it is tactically stronger.

### Escalation

- **0–20 seconds, one pursuer:** teaches apron sweeps, obstacle reversals, and the central crossing.
- **20–45 seconds, two pursuers:** one tends to chase while the second’s offset creates interception pressure.
- **45+ seconds, three pursuers:** remaining in one apron becomes unstable; connector occupancy and physical pincers force route switching.

Do not give police higher map-specific speed. The geometry should create escalation with the existing tuning in [tuning.ts](../modes/chase/tuning.ts).

---

## 8. Art direction

- **Palette:** ochre ground, charcoal-green tarmac, faded cream paint, dusty teal hangars, and one vermilion control tower. Police red/blue lights remain the most saturated moving colors.
- **Silhouettes:** one long low hangar, one offset maintenance block, one small service block, and one thin northern tower. Each has a distinct aspect ratio.
- **Lighting:** late-afternoon neutral sun, long enough shadows to communicate motion but not so long that they resemble barriers. Avoid night; the geometry should pass readability testing before police lights become the primary cue.
- **Surface language:** diagonal taxiways use faded edge stripes or occasional rectangular dashes. The service cut uses a warmer, worn pavement value.
- **Density budget:** four buildings, four shortcut barriers, two painted parking bays, no trees, no streetlights in the driving footprint.
- **Readability rule:** nothing decorative within 5 m of a paved edge except the four explicitly dangerous shortcut barriers.
- **PAKO influence:** low-poly masses, restrained texture, large color fields, clear car silhouettes, and very little information unrelated to pursuit.

No parked aircraft are necessary. The airfield fantasy should survive through scale, paint, hangar proportions, and the control tower.

---

## 9. Staged implementation

1. **Cheapest graybox**

   Add road rotation, five pavement rectangles, four ordinary building boxes, four barriers, spawn, and environment colors. No bespoke art or new AI behavior.

2. **Handling pass**

   Test only one police car. Adjust apron size, hangar footprint, taxiway width, and sightlines until both normal and hard drifts work without changing vehicle tuning.

3. **Pursuit pass**

   Test two and three pursuers. Add the small stuck detector and spawn-candidate safeguards only if telemetry confirms failures.

4. **Route-balance pass**

   Tune the service lane depth and barrier separation. Move east buildings rather than adding more obstacles.

5. **Readability art pass**

   Add faded markings and optional lightweight hangar/tower mesh styles. Preserve all graybox collision bounds.

6. **Polish**

   Tune fog, shadows, and color contrast; test Chase, Cruise, isometric, side, and close chase cameras. Do not rebuild the layout for nondefault cameras.

---

## 10. Playtest hypotheses

| Hypothesis | Pass criterion | Fail signal |
|---|---|---|
| The bow-tie is understandable without a minimap. | 80% of first-time players reach the opposite apron within 20 seconds and can point toward the north tower afterward. | Players repeatedly leave the boundary or describe the map as an undifferentiated lot. |
| Broad space still produces frequent authored drifting. | Median ≥4 intentional drift initiations/minute and ≥2 direction-changing transitions/minute in free drive. | Players drive straight across the aprons or only donut one obstacle. |
| Multiple routes remain viable. | No connector receives more than 55% of crossings across skilled sessions. | The southern cut or one diagonal becomes dominant above 65%. |
| The shortcut has genuine risk-reward. | Successful service-cut use is at least 10% faster between equivalent apron points, but its collision/capture rate is 1.5–2.5× a diagonal crossing. | It is always optimal, or almost nobody attempts it twice. |
| Two pursuers create interception rather than unavoidable contact. | Skilled median survival exceeds 60 seconds; fewer than 10% of captures occur within 3 seconds of reinforcement. | Captures cluster immediately at the central X. |
| Physical police remain the principal threat. | 60–80% of Chase runs end through police contact; 20–40% through scenery/boundary error. | Most runs end on hangars, making pursuit incidental. |
| Obstacles are readable from the close camera. | In video review, at least 90% of obstacle impacts were visible to the player for 0.75 seconds before contact. | Players consistently report “the building appeared under the camera.” |
| Police do not latch or stall. | Pursuers spend under 2% of active time below 3 m/s while over 12 m away; fewer than one forced reset per pursuer-minute. | Repeated sliding at the same hangar or barrier pair. |
| The map works without Chase. | After five minutes of Cruise, 70% of testers can describe at least three self-selected lines they attempted. | Free drive collapses into one obvious figure-eight. |

Compare these figures against Circuit City rather than treating absolute survival time as the only success measure.

---

## 11. Risks and exclusions

Primary risks:

- The west hangar could enable a trivial one-pursuer orbit. If so, shorten it or move it 4 m north; do not add random obstacles.
- The central X could become visually flat. Solve this with paint direction and the northern tower, not signage or HUD arrows.
- The southern gates could be too lethal for the close camera. Widen them before weakening collision rules.
- Direct seekers may repeatedly strike the east buildings. Increase their separation or shorten the long building before adding pathfinding.
- Large apron rectangles may initially feel empty. Test drift behavior before filling them.

Do not add:

- Traffic, parked-aircraft rows, cones, baggage carts, fences, or dozens of light poles.
- Destructible scenery, ramps, jumps, weapons, pickups, or police roadblocks.
- A full navmesh, police coordination layer, or scripted ambush spawns.
- Procedural obstacle placement.
- Invisible speed zones, different surface grip, or map-specific handling.
- A lap objective, racing line, route arrows, or scoring gates.
- Tall scenery beside decision points.
- More buildings merely to make the airfield appear “real.”

---

## 12. Recommendation

Crosswind should be the next map because it tests something Circuit City cannot: **open-area drift authorship under direct interception pressure**. Its two aprons provide recovery and expressive slide shape; its crossed taxiways turn momentum into route commitment; its narrow service cut supplies explicit risk-reward; and its sparse asymmetric landmarks keep a close camera oriented.

Most importantly, it creates varied chases with the police behavior that already exists. The first playable version needs only five pavement rectangles, four obstacle boxes, four barriers, and one small rotated-road extension.