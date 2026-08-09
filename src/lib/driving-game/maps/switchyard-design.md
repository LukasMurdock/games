# Switchyard — Chase map design

Research and design proposal based on the driving-game feel specification, existing maps and schema, current world construction, and Chase pursuit implementation.

## 1. Executive recommendation

Build **Switchyard**, an abandoned intermodal freight depot organized as three long driving lanes divided by two staggered rows of short freight sheds.

**Fantasy:** Thread a high-powered getaway car through a matte industrial yard, changing lanes through offset loading gaps just late enough to make pursuing police commit to the wrong side of a shed.

Switchyard adds a handling and Chase pattern absent from both existing maps:

- **Circuit City** is a network of perpendicular streets, intersections, lots, a diagonal shortcut, and a fast exterior circuit.
- **Crosswind** alternates between two open handling lobes through crossed connectors.
- **Switchyard** is a **longitudinal braid**. Survival depends on choosing when to stay in a lane, transfer one lane, chain an S-shaped double transfer, or reverse around a divider’s end.

The defining skill is **lateral commitment under pursuit**. The player reads which longitudinal channel the police occupy, preserves speed alongside short solid masses, then changes channels through staggered windows. It is neither a street grid, an open-lobe arena, nor a prescribed circuit.

The complete graybox fits the current `GameMapDefinition`. No schema or rendering extension is required.

---

## 2. Candidate comparison

| Candidate | Spatial grammar | New handling or Chase pattern | Decision |
|---|---|---|---|
| **Switchyard freight depot** | Three parallel channels, two staggered rows of short solid masses, offset cross-gaps, broad turning heads | Lane occupation, delayed lateral transfer, double-transfer feints, end-cap reversals | **Select.** It creates authored pursuit decisions using only convex obstacles and existing rectangles. |
| **Hilltop service park** | One serpentine road with switchbacks and rough-ground cut-throughs | Repeated hairpins and shortcutting across bends | Reject. Automatic throttle would make the narrow switchbacks depend too heavily on braking; direct-seeking police would cut across rough ground instead of respecting the switchback sequence. |
| **Marina service basin** | Central promenade with several narrow pier fingers | Enter-or-bypass choices and waterfront turnarounds | Reject. Pier fingers are effectively dead ends. They would require reverse when occupied and encourage direct seekers to latch against long parallel walls. |
| **Expo-center pinwheel** | Four halls around a broad central plaza, with radial exits | Hall orbits and center-crossing cutbacks | Reject. In play it would converge on Crosswind’s open-lobe/orbit pattern, with one central decision space and several equivalent exits. |
| **Orchard packing yard** | Regular rows of trees or storage sheds with periodic cross aisles | Slalom through repeating corridors | Reject. It requires too many small terminal obstacles, produces weak local orientation, and risks becoming either a reskinned city grid or an AI-hostile maze. |

Switchyard is the only candidate that remains legible, supports Automatic controls, produces substantial route choice, and gives reactive police useful interception angles without relying on dead ends or global pathfinding.

---

## 3. Research findings

### 3.1 Sourced evidence

#### PAKO and closed-area pursuit

The original PAKO describes itself as “Closed area. No Escape,” supports both classic and third-person chase cameras, and distinguishes 19 locations through different vehicles and environments. Its location list includes compact obstacle-driven spaces such as Mall, Cemetery, Square, Old Town, Airport, Trailer Park, and Launch Site. [Official PAKO App Store listing](https://apps.apple.com/us/app/pako-car-chase-simulator/id903183877)

A Tree Men Games interview characterizes the normal PAKO concept as navigating a small world while avoiding both static obstacles—trees and buildings—and moving obstacles such as police cars. That is useful evidence for treating solid masses and pursuers as one combined avoidance problem, rather than treating scenery as decoration around a separate chase system. [Tree Men Games interview with PocketGamer.biz](https://www.pocketgamer.biz/how-snake-inspired-tree-men-games-pako-caravan/)

Contemporary reviews describe Automatic acceleration, no brakes, short survival attempts, map-specific obstacle sets, and learning reliable routes through the pressure. They also identify narrow-road weaving and excessive collision density as sources of frustration. [Pocket Gamer review](https://www.pocketgamer.com/pako/review/), [Macworld overview](https://www.macworld.com/article/224203/you-should-play-pako.html)

#### Route choice and driving flow

Criterion developers described the landscape itself as central to *Burnout Paradise*. Players selected their own routes and shortcuts, ideally without interrupting the driving rhythm. [Burnout Paradise developer retrospective](https://www.gamedeveloper.com/design/devs-reflect-on-the-impact-and-legacy-of-i-burnout-paradise-i-)

Criterion later acknowledged that Paradise was not ideally laid out for very fast cars. For *Hot Pursuit*, it built and compressed a road network around the speeds the cars were expected to carry. [Criterion interview with Matt Webster](https://www.ea.com/en-gb/news/hot-pursuit-interview-criterion-matt-webster)

Track-design analysis links road width to available correction space. A narrower line can provide an advantage when executed accurately, but its reduced correction space is the cost. It also recommends separating memorable situations through distinct landmarks or features. [A Rational Approach to Racing Game Track Design](https://www.gamedeveloper.com/design/a-rational-approach-to-racing-game-track-design)

A WRC level-design account describes primary and secondary route types and emphasizes a small number of memorable landmarks, including long-range landmarks that preserve directional understanding. It also warns against introducing a handling grammar so briefly that the player cannot recognize and adapt to it. [Racing Level Design: The Rally Case](https://www.gamedeveloper.com/design/racing-level-design-the-rally-case)

#### Camera and close-range readability

Research into camera placement found that suitable viewpoints vary with the spatial information demanded by the task; players selected different camera arrangements when challenges required different awareness. [Naftis, Tsatiris, and Karpouzis, “How Camera Placement Affects Gameplay in Video Games”](https://arxiv.org/abs/2109.03750)

A perspective camera’s visible region is constrained by its position, field of view, and frustum. More environmental detail cannot compensate for an entrance that is outside the close camera’s visible region. [Unity, “Understanding the View Frustum”](https://docs.unity.cn/Manual/UnderstandingFrustum.html)

#### Reactive pursuit and obstacle avoidance

Craig Reynolds separates high-level strategy and path planning from reactive steering behaviors such as seek, pursuit, obstacle avoidance, and wall following. Combining local steering behaviors can produce useful motion, but it does not give an agent global route knowledge. [Reynolds, “Steering Behaviors for Autonomous Characters”](https://www.red3d.com/cwr/papers/1999/gdc99steer.html)

Reynolds’ obstacle-avoidance demonstration anticipates threats along the vehicle’s future path and applies lateral steering and braking before collision. The current game is more limited: its pursuer selects a tangent only after world contact. [Reynolds obstacle-avoidance demonstration](https://www.red3d.com/cwr/steer/Obstacle.html)

Reactive attraction-and-avoidance methods are efficient but can become trapped in local minima without global environmental awareness. Semi-enclosed spaces and opposing obstacle forces are recurring problem configurations. [Khatib, “Real-Time Obstacle Avoidance for Manipulators and Mobile Robots”](https://journals.sagepub.com/doi/10.1177/027836498600500106), [Moyano-Campos et al., local-attractor experiments](https://www.mdpi.com/2218-6581/12/3/81)

#### Real freight-yard scale references

ISO 668 standardizes the external dimensions of Series 1 freight containers; a common 40-foot module is approximately 12.2 m long and 2.44 m wide. These dimensions provide a useful visual scale reference, but do not prescribe the game’s clearances. [ISO 668:2020](https://www.iso.org/cms/%20render/live/es/sites/isoorg/contents/data/standard/07/69/76912.html?browse=tc)

The FHWA truck-parking handbook identifies turning radius, stall geometry, vehicle dimensions, and maneuvering space as central freight-facility considerations. Its cited WB-67 design vehicle is about 2.6 m wide and much longer than a passenger car, supporting the visual credibility of large turning heads around modest freight buildings. [FHWA Truck Parking Development Handbook](https://ops.fhwa.dot.gov/freight/infrastructure/truck_parking/docs/Truck_Parking_Development_Handbook.pdf)

### 3.2 Project-specific design inferences

The following are design conclusions for this project, not claims made by the sources:

- PAKO’s strongest applicable lesson is **compact spatial identity plus unavoidable pursuit**, not its instant-death density.
- Route choice should be readable as a change in steering commitment. A shortcut that exists only as a statistical distance saving is insufficient.
- Because Automatic throttle is the default, narrow areas must remain drive-through decisions rather than stop-and-turn puzzles.
- The map should contain repeated examples of one strong grammar—parallel travel and lateral switching—then vary width, timing, and pursuit occupancy.
- Direct-seeking police should be allowed to make understandable errors: committing along the wrong side of a shed, arriving late at a gap, or overshooting a transfer.
- They should not be asked to solve U-shapes, dead ends, long blind walls, or dense symmetric rows.
- A close camera needs the next transfer window to become recognizable before the player is already beside it. Distinct shed colors, visible end faces, and gaps at least 13 m long are more valuable than small signs or props.
- Freight-yard realism is a scale and silhouette reference. Actual terminal density would be hostile to this handling model and camera.

---

## 4. Core spatial grammar

Switchyard consists of one broad paved freight apron with two staggered rows of short freight sheds.

The rows divide the apron into:

1. A broad west channel.
2. A slightly narrower central channel.
3. A broad east channel.
4. A north turning head connecting all three.
5. A south turning head connecting all three.
6. Four intermediate one-row transfer gaps.
7. Two offset double-transfer opportunities where the player can braid from an outer channel, through the center, into the opposite outer channel.

The two divider rows deliberately do not align. A straight lateral attack through one gap points toward the solid portion of the opposite row. Crossing both rows therefore requires an S-shaped transition or a delayed second steering input.

### Repeatable decision cycle

1. Accelerate or drift along one longitudinal channel.
2. Read whether the nearest pursuer is directly behind, offset into the center, or already occupying the next gap.
3. Stay in the channel, transfer one lane, or begin a two-stage transfer.
4. Use the next shed end as a cutback anchor.
5. At the north or south head, choose a wide reversal, an immediate outer-channel sweep, or another lateral transfer.

This produces extended alternating transitions without prescribing a lap.

### Difference from Circuit City

- No general-purpose intersections.
- No perpendicular street grid.
- No urban blocks with four equivalent corners.
- No fast generated outer circuit.
- Route changes are discrete lane transfers through authored windows, not street selection at nodes.

### Difference from Crosswind

- No twin lobes or central crossed connectors.
- Much less uniformly open pavement.
- The primary decision is when to move laterally while retaining longitudinal momentum.
- Reversals occur around a sequence of short divider ends rather than around isolated apron landmarks.

---

## 5. Top-down plan

All measurements are approximate world metres. North is `+Z`.

```text
                                  NORTH +Z
                     22 m paved turning / recovery head
          x -74                                                x +74
             ┌────────────────────────────────────────────────┐
             │  orange dispatch tower                         │
             │     T                                           │
             │        ┌──── west row ────┐  ┌─ east row ───┐  │
             │        │ W3: 12 × 24      │  │ E3: 12 × 20  │  │
             │        │ z 28..52         │  │ z 32..52     │  │
             │        └──────────────────┘  └───────────────┘  │
             │              20 m GAP            17 m GAP       │
 WEST        │                                                    │ EAST
 CHANNEL     │        ┌──────────────────┐          ┌──────────┐  │ CHANNEL
 ~44 m       │        │ W2: 12 × 28      │          │E2:12×22 │  │ ~44 m
 paved       │        │ z -20..8         │          │z -7..15 │  │ paved
 width       │        └──────────────────┘          └──────────┘  │ width
             │              13 m GAP            22 m GAP          │
             │        ┌──────────────┐      ┌──────────────────┐  │
             │        │ W1: 12 × 22 │      │ E1: 12 × 26      │  │
             │        │ z -55..-33  │      │ z -55..-29       │  │
             │        └──────────────┘      └──────────────────┘  │
             │                                                    │
             │ spawn ↑ (-50,-46)                                  │
             └────────────────────────────────────────────────────┘
                     19 m paved southern turning head

        Divider centers: x -24 and +24
        Central channel between collider faces: 36 m
        Whole paved apron: 148 × 148 m
        World boundary: ±118 m
```

The diagram simplifies shed roof shapes. Every collider remains an axis-aligned rectangle.

---

## 6. Dimensions and effective clearances

The player and pursuers use approximately 1.25 m collision radii. For a passage bounded by two solid faces, effective center clearance is therefore:

`geometric gap − 2 × 1.25 m`

| Feature | Geometric clearance | Effective center clearance | Purpose |
|---|---:|---:|---|
| Central longitudinal channel | 36 m | 33.5 m | Full-speed transitions and two-pursuer passing room |
| Lower west-row gap | 13 m | 10.5 m | Shortest, highest-precision transfer |
| Upper west-row gap | 20 m | 17.5 m | Recovery-friendly transfer |
| Lower east-row gap | 22 m | 19.5 m | Broad teaching transfer |
| Upper east-row gap | 17 m | 14.5 m | Medium-risk transfer |
| Paved north/south head beyond shed ends | 19–22 m | 17.75–20.75 m relative to one shed face | Automatic-throttle reversal space |
| Outer paved channel, apron edge to divider collider | 44 m | 42.75 m relative to the shed face | Wide sweepers and pursuit recovery |
| Divider-row separation | 36 m | 33.5 m | Prevents corridor compression by two or three pursuers |

The building foundations render 0.85 m beyond the hard collider on each side. Consequently, a 13 m collider gap appears approximately 11.3 m wide at ground level. That reinforces its risk without making collision behavior tighter than specified.

The apron edge is not a solid boundary. A player can carry a wide slide onto rough ground and recover. The actual world boundary remains 44 m beyond the paved edge, providing generous nonterminal recovery space.

No shed face exceeds 28 m. A pursuer striking the midpoint of the longest face is at most approximately 14 m from an end.

---

## 7. Coordinate-level `GameMapDefinition` blueprint

This blueprint uses only current fields and the existing `standard`, `hangar`, and `tower` styles.

```ts
import type { GameMapDefinition } from "./types";

export const SWITCHYARD_MAP = {
  id: "switchyard",
  title: "Switchyard",
  description: "Three freight lanes, staggered transfer gaps, and broad turning heads.",
  worldLimit: 118,
  groundSize: 280,

  environment: {
    background: 0xc9d7d1,
    grass: 0x77785d,
    road: 0x444742,
    fogNear: 145,
    fogFar: 240,
    cameraFar: 290,
    sideCameraFar: 250,
    shadowExtent: 122,
    shadowFar: 195,
  },

  roads: [
    // One continuous freight apron prevents rough-ground lane-cutting
    // from becoming the dominant answer against slower off-road police.
    { x: 0, z: 0, width: 148, depth: 148, markings: false },

    // Slight value shifts identify the three longitudinal channels.
    { x: -50, z: 0, width: 30, depth: 140, markings: false, surfaceColor: 0x414744 },
    { x:   0, z: 0, width: 30, depth: 140, markings: false, surfaceColor: 0x484b45 },
    { x:  50, z: 0, width: 30, depth: 140, markings: false, surfaceColor: 0x404643 },
  ],

  parkingLots: [
    // Painted inspection pads act as local orientation marks.
    { x: -52, z: 24, width: 16, depth: 10 },
    { x:  52, z: -22, width: 16, depth: 10 },
  ],

  buildings: [
    // West divider: warm, slightly taller freight sheds.
    { x: -24, z: -44, width: 12, depth: 22, height: 5.5, color: 0xb78c68, style: "hangar" },
    { x: -24, z:  -6, width: 12, depth: 28, height: 5.0, color: 0xa97f60, style: "hangar" },
    { x: -24, z:  40, width: 12, depth: 24, height: 5.5, color: 0xc09a70, style: "hangar" },

    // East divider: cool and lower to protect Side-camera readability.
    { x: 24, z: -42, width: 12, depth: 26, height: 4.5, color: 0x688b88, style: "hangar" },
    { x: 24, z:   4, width: 12, depth: 22, height: 4.0, color: 0x789b94, style: "hangar" },
    { x: 24, z:  42, width: 12, depth: 20, height: 4.5, color: 0x5f817f, style: "hangar" },

    // A tall northwest landmark, outside all transfer windows.
    { x: -62, z: 56, width: 8, depth: 8, height: 20, color: 0xd06b43, style: "tower" },
  ],

  trees: [],
  streetlights: [],
  barriers: [],

  spawn: { source: "position", x: -50, z: -46, heading: 0 },
} satisfies GameMapDefinition;
```

### Schema assessment

No new schema is justified for the first release:

- Rotated roads already exist but are unnecessary.
- Existing hangar meshes provide suitable low freight-shed silhouettes.
- Existing axis-aligned building collision matches the plan.
- The three overlaid road bands provide orientation without a new marking system.
- Container stacks, rails, cranes, water, elevation, and fences are unnecessary to establish the fantasy.

If freight identity remains weak after graybox art testing, the cheapest later improvement would be a new visual-only building style that renders two or three matte container-like box courses inside the existing collision bounds. It should not alter collision, map semantics, or the initial implementation schedule.

---

## 8. Spawn and reinforcement fairness

### Opening spawn

The player begins at `(-50, -46)` facing north in the west channel.

The first pursuer’s normal 17 m rear offset places it near `(-50, -63)`:

- On the paved apron.
- Approximately 17 m behind the player.
- Clear of W1, whose collider occupies `x = -30..-18`.
- Clear of the southern world boundary.
- Facing the same direction as the player.
- Covered by the existing 1.8-second capture grace.

The player’s first uncomplicated options are:

- Continue north in the west channel.
- Sweep around W1’s southern end.
- Transfer through the 13 m lower west gap.
- Use the broad southern head for a reversal.

No opening option requires braking or reverse.

### Reinforcements

At 20 seconds, formation slot 1 attempts approximately 30 m behind and 8 m laterally offset. At 45 seconds, formation slot 2 attempts approximately 38 m behind and 8 m to the opposite side.

The apron’s 148 × 148 m open footprint and 36–44 m channel widths make valid placements likely. The staggered sheds occupy only a small fraction of candidate space.

Fairness still depends on the current generic fallback behavior: if every rear candidate is outside the boundary or colliding, the pursuer returns to the fixed map spawn. That could place a reinforcement ahead of or too near a player who happens to be in the southern half.

Recommended validation:

- Record whether each reinforcement used its requested formation candidate, an alternate candidate, or fixed spawn fallback.
- Require fixed-spawn fallback in fewer than 1% of reinforcements.
- If that criterion fails, expand the generic candidate set or delay placement briefly. Do not create a Switchyard-specific spawn system.
- Retain the existing 1.35-second reinforcement capture grace.
- Do not deliberately place reinforcements into an adjacent lane as an ambush.

A reinforcement may happen to occupy another channel through the existing lateral offset. That is fair emergent geometry, provided it remains behind the player.

---

## 9. Authored Cruise and Chase situations

| Situation | Cruise value | Chase decision |
|---|---|---|
| **1. Southern launch sweep** | A broad first drift around W1’s south end, with room to learn release timing. | Continue north with the pursuer behind or reverse across the turning head before it closes. |
| **2. Lower west needle** | Thread the 10.5 m effective transfer and practice a compact drift exit. | Transfer late so a direct seeker reaches the shed face, or stay west if the gap is already occupied. |
| **3. Lower freight braid** | Cross west-to-center through the west gap, hold a short neutral beat, then cross center-to-east through the offset 22 m gap. | A straight double cut points at E1; the player must decide whether to complete the S or cut back into the center. |
| **4. Central channel carry** | Use the 33.5 m effective channel for long shallow slides and alternating proximity runs. | Preserve speed while police approach from one or both adjacent gaps; choose the less occupied transfer window. |
| **5. W2/E2 cutback pair** | Orbit either short shed end, then reverse direction without entering a repetitive full-building loop. | Let a pursuer commit past an end, rotate behind it, and leave through the next gap before it recovers. |
| **6. Upper freight braid** | Chain the 20 m and 17 m gaps as a faster, more forgiving S sequence. | Two pursuers may separate across rows; complete one transfer, delay the second, or return to the starting lane. |
| **7. North turning head** | Build a wide 180-degree slide around either divider row’s end. | A chasing car takes the shorter inside line while the player chooses a wide momentum-preserving arc or an early lane switch. |
| **8. Tower-side reversal** | Use the orange tower and W3 as a memorable proximity pair without entering a dead end. | The tower removes some west-head recovery space; the player can cut between tower and shed only if the police line leaves it clear. |
| **9. Outer-channel sweeper** | Carry a long high-speed arc along the apron edge, dipping onto rough ground if the drift runs wide. | Rough ground offers recovery, but staying there lets oncoming police compress from the paved interior and eventually exploits their lower off-road maximum less effectively than an unpaved map would. |
| **10. Three-lane occupation** | Compose a full-yard line without following a prescribed lap. | With three pursuers, read which channel is physically occupied and transfer before all three converge on the same turning head. |

The geometry supports figure-eights around adjacent sheds, alternating braids, full perimeter sweeps, one-row slaloms, repeated gap practice, and improvised proximity lines.

---

## 10. Direct-seeking police interaction

The current pursuer:

- Smooths its observed target.
- Predicts the player by 0.32 seconds initially.
- Steers directly toward that target.
- Selects a collision tangent only after contacting a world obstacle.
- Reduces speed sharply after obstacle contact.
- Has no obstacle look-ahead, path planner, navmesh, memory, or team coordination.
- Reaches a slightly more accurate 0.38-second prediction and faster target response over 30–45 seconds.
- Receives no speed increase from the accuracy ramp.

Switchyard is designed around those facts.

### 0–20 seconds: one pursuer

One pursuer naturally follows the player’s longitudinal channel.

The player’s strongest techniques are:

- Late one-row transfers.
- Cutbacks around a shed end.
- Wide reversals in a turning head.
- A two-stage braid in which the second steering decision occurs after the pursuer has committed to the first gap.

A single pursuer should not be defeated indefinitely by circling one shed. The sheds are narrow and short, while the surrounding channels are broad enough for the pursuer to acquire changing interception angles.

The lower west gap is intentionally the strongest one-pursuer feint. At 13 m it is readable and traversable under Automatic throttle, but a late or excessive slide can still hit W1 or W2.

### 20–30 seconds: two pursuers, base accuracy

The second pursuer begins behind with a lateral offset. It may initially occupy the same channel, the center channel, or a transfer approach depending on the player’s heading.

Without coordination, useful pressure emerges from geometry:

- One car follows the current lane.
- The other often approaches a transfer from a different angle.
- If both enter the same channel, the player can use the next staggered gap.
- If they split, the broad turning heads permit a reversal before they form a physical pincer.

No gap is narrow enough that one stationary police car automatically seals it. In the 10.5 m effective center corridor, a 2.5 m-diameter police footprint still leaves substantial lateral escape space, although a high-speed pass becomes risky.

### 30–45 seconds: two pursuers during the accuracy ramp

Prediction increases from 0.32 to 0.38 seconds, target reaction rises from 3.2 to 4, and turning rates improve slightly.

This should change timing rather than invalidate routes:

- Early lane changes become easier to predict.
- Long, smooth arcs become less effective.
- Late transfer commitment remains viable because the prediction horizon is still short.
- Double transfers become riskier if the player reveals the second turn too early.
- Cutbacks remain useful because the pursuer cannot globally infer which later gap the player intends to use.

The ramp coincides with the latter half of the two-pursuer phase. This is desirable: players first learn lane occupation at base accuracy, then must disguise the same transfers more effectively.

### 45 seconds and beyond: three pursuers, full accuracy

The third car adds channel occupation rather than scripted interception.

Expected state:

- One pursuer applies direct rear pressure.
- One is recovering from or approaching a divider.
- One may occupy an adjacent channel because of reinforcement offset or recent geometry.

The player must avoid carrying all three into the same end head. A turning head that is safe against one car becomes compressive against three.

The intended advanced pattern is:

1. Draw two cars along one outer channel.
2. Transfer into the center through a broad gap.
3. Read whether the third car occupies the opposite gap.
4. Complete the braid, cut back, or reverse around the nearest short shed.
5. Leave before all three realign longitudinally.

This is emergent pursuit. It requires no police speed changes, formation tactics, ambush scripting, or map-specific modifiers.

---

## 11. Anti-stuck and anti-latching analysis

### Risks specific to Switchyard

#### Long-face latching

W2 has a 28 m face. A pursuer striking near its midpoint may choose the correct tangent but collide again while its heading converges.

Mitigations already present:

- Maximum distance to an end is approximately 14 m.
- Collision cuts pursuer speed to 48%.
- Avoidance heading persists for 0.72 seconds.
- The player is likely moving longitudinally, making one tangent clearly closer to the target heading.

If repeated collision persists, shorten W2 to 24 m before modifying AI.

#### Corner pinball

A pursuer entering a 13–17 m gap obliquely could strike one shed, follow its tangent, then hit the opposing shed corner.

Mitigations:

- The smallest collider gap is 13 m.
- Divider rows are separated by 36 m.
- Opposing row gaps are staggered, preventing a straight narrow tunnel through both rows.
- There are no barriers inside transfer windows.

If telemetry shows alternating collisions, widen the affected gap by moving one shed 2–3 m. Do not add invisible steering assistance.

#### False wall alignment

If several shed ends line up, reactive police may behave as if facing one long wall.

The current coordinates prevent this:

- West and east row gaps occur at different `z` positions.
- Shed lengths differ.
- The two upper ends align only near the open north turning head, where both bypass directions are visible.

#### Low-speed orbiting

Two police cars could push one another around a shed end while both seek the player on the far side.

Vehicle-to-vehicle collisions already separate them, but the map should be tested for repeated low-speed bunching. The preferred geometry fix is more end clearance, not police phasing or coordination.

### Telemetry thresholds

Flag a possible stuck event when a pursuer:

- Remains below 3 m/s for more than 1.25 seconds.
- Is more than 12 m from the player.
- Registers at least three world collisions within 1.5 seconds.

Pass criteria appear in the playtest section. A generic reset safeguard should be considered only if geometry adjustments cannot meet them across all maps.

---

## 12. Camera readability

### Isometric starting camera

The stable orthographic camera is the best view for understanding the braid:

- Parallel channels form a strong graphic pattern.
- Warm west sheds and cool east sheds establish local orientation.
- Staggered ends make gaps visible as negative space.
- The orange northwest tower gives a global directional landmark.
- The three slightly different pavement bands remain useful when the tower is outside the local frame.

Avoid tiny freight markings that only become visual noise at this scale.

### Close Chase camera

The current Chase camera is approximately 5–5.5 m behind the car with a roughly 60–66° dynamic FOV.

Close-camera rules:

- Every transfer gap is at least 13 m long.
- A player traveling beside a 22–28 m shed sees its end face before reaching the gap.
- The second half of a double transfer is offset by 5.5–8.5 m, exposing it as a separate steering decision rather than one concealed opening.
- No props, poles, or barriers sit in a transfer approach.
- Shed height remains 4–5.5 m so roofs do not dominate the horizon.
- Pavement bands and shed color communicate channel position without requiring a distant overview.

The lower west gap should be widened before any camera change if players cannot reliably identify it.

### Side camera

The Side camera views from `+X`, so the east divider row is the primary occlusion risk.

Mitigations:

- East sheds are only 4–4.5 m high.
- The camera is elevated approximately 15 m.
- East sheds have different lengths and large gaps, preventing a continuous visual wall.
- No tall eastern landmark is proposed.
- The 20 m tower is on the west side, behind rather than in front of most gameplay from this view.

Pass testing should measure player and nearest-pursuer occlusion, especially while the player is in the center or west channel.

---

## 13. PAKO-inspired art direction

### Palette

- **Ground:** desaturated olive-gray rough ground.
- **Pavement:** charcoal with subtle green variation.
- **West sheds:** dusty clay, ochre, and faded salmon.
- **East sheds:** oxidized teal and blue-green.
- **Landmark:** one restrained safety-orange dispatch tower.
- **Paint:** warm off-white, faded yellow, and no saturated advertising.
- **Moving color:** police lights remain the most saturated elements.

### Shape language

- Six low freight sheds with clear rectangular footprints.
- Three slightly longer silhouettes and three shorter ones.
- One thin tower outside the transfer network.
- Broad uninterrupted pavement.
- No decorative stacks along playable shed faces.

### Shadows

Use graphic shadows to expose:

- Shed ends.
- Gap widths.
- Direction of travel alongside each divider.
- Relative motion of police cars.

Shadows must not bridge a gap and make it appear closed. If necessary, adjust lighting or lower shed height before adding fill lights.

### Density budget

| Element | Budget |
|---|---:|
| Solid freight sheds | 6 |
| Global tower landmark | 1 |
| Painted inspection pads | 2 |
| Barriers | 0 |
| Trees | 0 |
| Streetlights | 0 |
| Decorative objects inside driving footprint | 0 |
| Optional noncolliding paint motifs | Maximum 8 large marks |

The freight fantasy should come from repetition, scale, bay-like shed doors, color blocking, and pavement bands—not forklifts, cones, trailers, rails, cranes, or container clutter.

---

## 14. Cheapest graybox and staged implementation

### Stage 1: cheapest graybox

Build only:

- One 148 × 148 m paved rectangle.
- Six ordinary building boxes.
- One tower box.
- Player spawn.
- Existing environment colors.

Use standard boxes if hangar construction complicates the first handling test. Do not add parking pads, props, special markings, or AI changes.

### Stage 2: handling pass

Test Cruise with Automatic controls:

- Longitudinal shallow drifts.
- Lower 13 m transfer.
- Both double-transfer braids.
- North and south reversals.
- Rough-ground recovery.
- No-brake continuous driving.

Adjust shed positions before vehicle tuning.

### Stage 3: one-pursuer pass

Test:

- Late transfer overshoot.
- Shed-end cutbacks.
- Single-shed orbit resistance.
- World-collision frequency.
- Latching on W2.

Shorten or shift sheds before considering pursuer behavior changes.

### Stage 4: escalation pass

Run standard reinforcement timing:

- Second pursuer at 20 seconds.
- Accuracy ramp from 30 to 45 seconds.
- Third pursuer at 45 seconds.

Measure lane occupation, immediate post-reinforcement captures, spawn fallback, and low-speed pursuit time.

### Stage 5: camera pass

Test Isometric, Chase, and Side without geometry changes between cameras. Reduce east-shed height or widen a gap if necessary.

### Stage 6: art pass

Add:

- Hangar styles.
- Warm/cool row identity.
- Tower silhouette.
- Three pavement value bands.
- Two painted inspection pads.
- Restrained fog and shadows.

### Stage 7: polish

Only after the geometry passes:

- Adjust individual shed colors.
- Tune surface-value contrast.
- Consider a visual-only container-stack style if the freight fantasy remains unclear.
- Recheck collision readability against foundation overhangs.

---

## 15. Quantitative playtest hypotheses

| Hypothesis | Pass criterion | Failure response |
|---|---|---|
| The braid is understood without a minimap. | At least 80% of first-time players use two different transfer gaps within 60 seconds of Cruise. | Increase pavement-band contrast or shift the broad lower east gap closer to spawn. |
| Automatic controls are sufficient. | After two minutes of practice, at least 90% of transfer attempts are made without requesting brake or reverse; at least 70% of testers successfully traverse the 13 m gap. | Widen the lower west gap to 15 m. |
| Cruise supports self-authored play. | After five minutes, at least 70% of players can describe four distinct lines they attempted; median intentional drift initiations are at least five per minute. | Move or shorten sheds; do not add props. |
| Lane choice is meaningful. | No single longitudinal channel accounts for more than 55% of skilled Chase travel time. Both outer channels receive at least 20%. | Adjust gap placement or tower interference. |
| Both braids are used. | Each double-transfer pair accounts for at least 15% of skilled cross-row movements. | Make the underused pair broader or more visible. |
| Narrow and broad gaps express risk-reward. | The 13 m gap saves at least 0.4 seconds over the nearest end-around route but has 1.5–2.5 times its scenery-impact rate. | Change shed spacing, not surface speed. |
| One-shed orbiting is not dominant. | No repeating single-shed orbit exceeds 20 seconds in more than 5% of skilled one-pursuer tests. | Shorten the implicated shed or increase its end clearance. |
| Accuracy ramp changes timing, not viability. | From 30–45 seconds, successful early transfers fall while late transfers remain at least 60% successful for skilled players. No route’s use drops below half its pre-ramp rate. | Widen the most prediction-sensitive gap. |
| Reinforcements are fair. | Fewer than 10% of captures occur within two seconds after reinforcement grace ends; fixed-spawn fallback occurs below 1%. | Improve generic spawn candidates or adjust boundary margin. |
| Pursuers remain mobile. | Each pursuer spends under 2% of active time below 3 m/s while more than 12 m from the player. Fewer than 0.5 repeated-collision episodes occur per pursuer-minute. | Shorten W2/E1 or widen the implicated gap. |
| Side camera remains usable. | Player and nearest pursuer are simultaneously obscured by a shed in fewer than 5% of reviewed Side-camera frames. | Lower or shorten east-row sheds. |
| Close-camera collisions are attributable. | At least 90% of terminal scenery impacts were visible for 0.75 seconds before contact. | Widen the approach or reduce shed height/value ambiguity. |
| Rough ground is recovery, not a dominant exploit. | Skilled players spend under 20% of Chase time outside the apron, and off-pavement time has no greater than a 10% positive correlation with survival. | Increase paved footprint before changing surface tuning. |
| Police remain the Chase threat. | Between 55% and 80% of completed skilled runs end through police contact; scenery and boundary errors account for the rest and are never labeled capture. | Simplify the tightest geometry if scenery dominates. |
| Difficulty is comparable without hidden tuning. | Skilled median survival falls within ±15% of the combined Circuit City/Crosswind baseline using identical vehicle and Chase tuning. | Adjust shed placement and clearance only. |

Compare telemetry by camera and control scheme. Manual play is useful for stress testing but must not set the pass threshold for Automatic.

---

## 16. Risks and what to simplify first

### Primary risks

#### The yard feels like one large parking lot

The building braid may not sufficiently influence lines.

Simplify or adjust in this order:

1. Increase pavement-band contrast.
2. Move one divider row 2–3 m inward.
3. Lengthen one short shed by at most 4 m.
4. Do not add scattered obstacles.

#### The central channel becomes universally safest

Its 36 m width may let players avoid meaningful proximity.

Response:

1. Offset W2 or E2 by 2 m toward the center.
2. Reduce central width to no less than 32 m geometric.
3. Preserve at least 29.5 m effective center clearance.
4. Do not increase police speed.

#### The lower west gap is too lethal

Response:

1. Widen it from 13 to 15 m.
2. Shorten W1 or W2 rather than removing collision.
3. Keep it visually distinct.
4. Do not add braking prompts.

#### One outer channel dominates

The tower may make the northwest less attractive, or the broader east gaps may make the east too safe.

Response:

1. Move the tower farther west or north.
2. Shift a broad gap by 3–4 m.
3. Change geometry before surface color.
4. Do not introduce invisible traction or police modifiers.

#### Side-camera occlusion is excessive

Response:

1. Lower east sheds.
2. Shorten E1 or E2.
3. Increase east gap size.
4. Do not move the Side camera solely for this map.

#### Police repeatedly collide with paired corners

Response:

1. Widen the affected gap.
2. Increase the longitudinal stagger.
3. Shorten the longer shed.
4. Consider generic stuck recovery only after geometry changes fail.

---

## 17. Exclusions

Do not add:

- Working rail vehicles, traffic, parked trucks, or forklifts.
- Dense container rows.
- Long fences or solid perimeter walls.
- Dead-end loading bays.
- Destructible containers or barriers.
- Ramps, jumps, elevation, water, or bridges.
- Navmesh, flow field, waypoint graph, or route planning.
- Police coordination, formation tactics, roadblocks, or scripted ambushes.
- Map-specific police speed or accuracy.
- Surface-specific grip changes.
- Mandatory braking, reverse, or manual throttle.
- A lap, race, minimap, route arrows, scoring gates, or objectives.
- Pickups, weapons, traps, or moving hazards.
- Procedural shed placement.
- Decorative realism that weakens silhouettes or gap readability.

---

## 18. Final recommendation

**Switchyard should be the next map.**

It introduces a genuinely new spatial grammar: **three longitudinal freight channels connected by staggered lateral transfer windows**. Its repeatable Chase question is not “which street?” or “which lobe?” but:

> **Do I hold this lane, transfer now, or delay until the police have committed?**

That question scales naturally:

- One pursuer teaches late transfers and shed-end cutbacks.
- Two pursuers create channel occupation and interception without coordination.
- The 30–45 second accuracy ramp punishes telegraphed transfers while preserving late decisions.
- Three pursuers turn the broad end heads into temporary compression zones and make two-stage braids unstable but survivable.

The map supports expressive Cruise play, works with Automatic throttle, remains readable in close and orthographic cameras, and avoids geometry that demands a navmesh. Its first playable version is exceptionally cheap: one paved rectangle, six short axis-aligned obstacles, one landmark, and the existing spawn and Chase systems.

If the graybox fails, its tuning variables are equally economical: shed length, gap length, row spacing, and tower position. No new game system is needed.

---

## Sources

All web sources accessed **2026-08-09**.

- [Tree Men Games — PAKO official App Store listing](https://apps.apple.com/us/app/pako-car-chase-simulator/id903183877)
- [PocketGamer.biz — Tree Men Games interview about PAKO’s obstacle-navigation concept](https://www.pocketgamer.biz/how-snake-inspired-tree-men-games-pako-caravan/)
- [Pocket Gamer — PAKO review](https://www.pocketgamer.com/pako/review/)
- [Macworld — PAKO overview](https://www.macworld.com/article/224203/you-should-play-pako.html)
- [Game Developer — Burnout Paradise developer retrospective](https://www.gamedeveloper.com/design/devs-reflect-on-the-impact-and-legacy-of-i-burnout-paradise-i-)
- [Electronic Arts — Criterion interview with Matt Webster](https://www.ea.com/en-gb/news/hot-pursuit-interview-criterion-matt-webster)
- [Game Developer — A Rational Approach to Racing Game Track Design](https://www.gamedeveloper.com/design/a-rational-approach-to-racing-game-track-design)
- [Game Developer — Racing Level Design: The Rally Case](https://www.gamedeveloper.com/design/racing-level-design-the-rally-case)
- [Naftis, Tsatiris, and Karpouzis — How Camera Placement Affects Gameplay in Video Games](https://arxiv.org/abs/2109.03750)
- [Unity — Understanding the View Frustum](https://docs.unity.cn/Manual/UnderstandingFrustum.html)
- [Craig Reynolds — Steering Behaviors for Autonomous Characters](https://www.red3d.com/cwr/papers/1999/gdc99steer.html)
- [Craig Reynolds — Obstacle Avoidance steering demonstration](https://www.red3d.com/cwr/steer/Obstacle.html)
- [Oussama Khatib — Real-Time Obstacle Avoidance for Manipulators and Mobile Robots](https://journals.sagepub.com/doi/10.1177/027836498600500106)
- [Moyano-Campos et al. — Experiments on the Artificial Potential Field with Local Attractors](https://www.mdpi.com/2218-6581/12/3/81)
- [ISO — ISO 668:2020 freight-container classification and dimensions](https://www.iso.org/cms/%20render/live/es/sites/isoorg/contents/data/standard/07/69/76912.html?browse=tc)
- [FHWA — Truck Parking Development Handbook](https://ops.fhwa.dot.gov/freight/infrastructure/truck_parking/docs/Truck_Parking_Development_Handbook.pdf)