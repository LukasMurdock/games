# Driving Game Feel Specification

This document is the experiential north star for the driving game in this directory. `runtime.ts` orchestrates the session, `player/` owns handling and feedback state, and `maps/`, `modes/`, and `driving-profiles.ts` define the switchable content around them. It reflects the game as it exists now: automatic throttle by default, a hidden unlockable desktop manual-control scheme, steering plus a held Drift input, a double-tap hard-turn gesture, distinct drift phases, switchable maps, assisted arcade physics, close chase cameras, persistent marks and smoke, and reference-derived procedural engine and tire audio.

It is not a promise to simulate a car accurately. It defines what every system should help the player believe.

## 1. The actual fantasy

The player is throwing an overpowered car into corners at unreasonable speed, deliberately making it look unstable, and then proving that the instability belongs to them.

The shortest formulation is **controllable excess**: the car should look more dangerous than it is to operate, while line, timing, angle, transitions, and exits remain visibly player-authored.

The player should repeatedly think:

- “That was aggressive.”
- “I meant to do that.”
- “I could take the next one cleaner.”
- “One more corner.”

The fantasy is not accurate tire management, competition administration, or merely watching a canned drift animation. The fantasy is shaping a slide.

## 2. What the car should feel like in the hands

### Steering

In grip, steering should be immediate but deliberately broad at speed. The car feels planted and substantial rather than twitchy. A player can navigate normally, but a tight high-speed corner invites Drift instead of allowing grip steering to solve everything.

During a drift, steering changes the shape of an already-established slide. Steering into the drift asks for more angle and a tighter rotation. Countersteering bleeds angle and prepares an exit. The result must be predictable enough that the player develops intent, not superstition.

### Weight and inertia

Velocity must remain legible. The chassis may rotate dramatically, but the car continues traveling along a believable trajectory. The player should see the difference between where the nose points and where the mass is going.

Weight is communicated through delayed yaw, body roll and pitch, camera lag, tire loading, smoke onset, and the rhythm of transitions. Weight must never become input latency.

### Acceleration

Throttle is automatic in the default scheme. Power creates constant forward pressure: the player is always arriving at the next decision. A hidden desktop manual scheme may transfer that authority to Up/W and use Down/S to brake and reverse, but it must not change the underlying drift model or become required for the core toy.

The engine should pull hard through short gears, then settle into a lower-load overdrive at sustained maximum speed rather than droning at redline forever. A clean drift exit temporarily converts control quality into stronger forward motion; in Manual controls, that extra force still requires acceleration input.

### Traction and breakaway

Grip is stable until the player deliberately holds Drift while steering above the minimum entry speed. Breakaway should be decisive and readable. The player should never wonder whether the button worked.

Small input timing forgiveness is desirable. The existing buffered initiation supports intent without visibly driving for the player.

Double-tapping the same steering direction requests a stronger entry through the same sideslip controller. For roughly 200 ms it asks for a deeper angle, stronger set impulse, and tighter trajectory; then authority returns to the normal sustain model. It can rescue a widening line or set up a hairpin, but pays primarily through the angle-based momentum cost rather than a hidden braking tax. A clean hard-drift exit remains eligible for the normal hook-up reward. If a directional double-tap begins without Drift held, its direction remains armed for 0.6 seconds; pressing Drift during that window reconnects to the hard slide instead of dropping into an unrelated normal entry. Opposite steering, pause, reset, or expiry cancels that re-entry intent.

### Drift angle control

The useful center of the game is approximately 15–40 degrees of slip, not one exact angle:

- Below roughly 5–8 degrees: grip and tire loading.
- Around 8–15 degrees: breakaway and early slide.
- Around 15–32 degrees: clean, expressive, speed-conscious drifting.
- Around 32–40 degrees: dramatic and increasingly expensive.
- Above roughly 40 degrees: recoverable distress, greater drag, rougher sound, and a difficult exit.

These are perceptual bands, not promises that every system switches at the same number.

A large angle should make rotation and spectacle easier, but should cost momentum. Beginners may survive noisily; experts should use only the angle their line requires.

### Countersteer

Countersteer should be powerful but not magical. It reduces the requested angle, raises front scrub, and—if held with commitment—begins a transition. It should feel like the player is moving weight and setting a new direction, not choosing a menu option.

### Transitions

A transition has three beats: release, neutral load, opposite catch. It must not sound or look like uninterrupted rotation. The body settles across, the old tire mode unloads, the camera retains a stable frame, and the opposite slide attacks.

Transitions are a primary mastery mechanic because their timing controls rhythm, speed preservation, and positioning for the next corner.

### Recovery

Releasing Drift always requests hook-up. This rule is intentionally simple and must remain trustworthy. Heading and velocity converge progressively rather than snapping together.

Recovery should be generous, but a poor release still costs road position and speed. A clean release should produce the belief: **“I caught it.”**

## 3. One perfect corner

### Anticipation

The player sees an intersection, curb, building edge, or circuit phrase approaching. The close camera and environmental motion communicate speed. The engine carries load; road and wind provide motion without dominating. The car remains planted enough that commitment feels voluntary.

The player chooses a line and decides how late to initiate.

### Initiation

The player steers and holds Drift. Within one readable beat, rear traction releases. Chassis yaw, body kick, tire attack, camera reaction, smoke onset, and steering posture should agree about when this happened.

The emotional response is: “Yes, there it goes.”

### First 100–300 ms

The breakaway phase briefly grants greater set authority. The nose rotates toward the desired exit while velocity continues down the entry line. Tire modes rise sharply, the rear visually plants into the slide, and the player establishes angle.

This interval should feel forceful, not chaotic. An expert uses less of it; a beginner can lean on it.

### Sustained drift

The car settles into controlled instability. Tire audio becomes strong and relatively clean in the healthy range. Smoke and marks show the path without obscuring it. The chase camera partially follows velocity so both angle and destination remain visible.

The player adjusts angle and line, judges obstacle distance, and decides whether to preserve momentum or increase spectacle.

### Adjustment

A small correction should produce a small, legible response. Front scrub rises under hard countersteer; excessive rear slip becomes rougher and slower. The player should know from eyes and ears whether the drift is healthy before a collision proves otherwise.

### Exit

The player releases Drift. Tire modes unload, yaw converges, smoke falls away, and the engine returns to the front of the mix. A clean alignment triggers a restrained exit boost and forward camera pulse.

The emotional response is: “Straighten—now—yes.”

### 300–500 ms after exit

The car is stable and accelerating toward the next decision. The previous corner remains visible as marks and receding smoke, but feedback clears quickly enough to establish a fresh rhythm.

The desired thought is not “I completed a state machine.” It is “Again.”

## 4. Where the player should feel powerful

- **Dominance:** holding a stable high-speed slide near a building without fighting the controls.
- **Danger:** committing late, carrying visible lateral momentum, or crossing into rough high-angle distress.
- **Relief:** releasing Drift and feeling the tires progressively bite.
- **Precision:** using a shallow angle to preserve speed through a city intersection.
- **Aggression:** the synchronized snap of breakaway and the opposite catch in a transition.
- **Flow:** chaining alternating corners without returning to visual or sonic neutrality for too long.
- **Mastery:** choosing less angle, later initiation, tighter proximity, and earlier alignment while appearing more dramatic than a beginner.

Assistance should stabilize consequences, not erase choices. The player chooses entry, direction, duration, angle request, transition timing, and release. Those choices must remain visible in the resulting path.

## 5. What mistakes should feel like

### Small mistake

Examples: slightly early initiation, a little too much angle, or a late correction.

Cost: minor speed loss, a wider line, rougher tire texture, or a less forceful exit. The drift continues. The game says “yes, and.”

### Moderate mistake

Examples: holding excessive angle, countersteering too late, or entering an intersection on the wrong line.

Cost: significant scrub, poor road placement, missed chaining opportunity, grass contact, or no clean-exit boost. The player must actively recover but should rarely spin from one error.

### Serious mistake

Examples: accumulated overcorrection, a transition aimed toward a building, or remaining sideways after the available road has ended.

Cost: a violent loss of speed, barrier impact, forced recovery, or collision. The error should be understandable before impact.

### Catastrophic mistake

Examples: striking a building or leaving the outer world boundary.

Cost: immediate reset. Resets are reserved for clear spatial failure, not ordinary drift imperfection. Because the game has no mandatory objective, a reset should return the player to driving quickly rather than moralize the mistake.

## 6. Why drifting remains satisfying

### After five minutes

Immediate initiation, large readable slides, smoke, marks, tire sound, and clean exits provide uncomplicated toy-like pleasure. The city offers intersections, lots, and slaloms; the outer circuit offers longer phrases.

### After one hour

The player distinguishes clean angle from wasteful angle, learns when to release, discovers transition rhythm, and begins selecting routes through the city rather than reacting one corner at a time.

### After ten hours

Depth comes from speed preservation, entry placement, proximity, minimal correction, transition setup, and composing multiple corners. The same road supports different lines and angle strategies.

### After fifty hours

The game can only retain depth if control remains deterministic enough for self-competition. Persistent mastery is visible as cleaner arcs, braver entries, smaller unnecessary slip, more purposeful transitions, and near-wall consistency—not merely a score increasing.

Variety should come from player-authored routes and different corner geometries, not randomized handling. Internal driving profiles are tuning tools, not arbitrary per-run mutations. Game modes may change goals, pressure, supporting actors, and HUD state, while maps change space and presentation; neither should silently randomize core handling.

## 7. Beginner experience

### First ten seconds

The car accelerates automatically. The player learns that steering is immediate and that no throttle or brake management is required. They should already be able to stay on a broad road.

### First minute

The player holds Drift while steering and produces an unmistakable slide. Releasing Drift straightens the car. Even a clumsy attempt should look exciting and remain recoverable.

The likely initial misunderstanding is that maximum angle is always best. The game should let that be fun before naturally revealing its speed cost.

### First ten minutes

The player discovers that initiation timing changes the entire corner, countersteer shapes angle, release timing controls exit quality, grass is survivable but slower, and buildings are absolute boundaries. They begin chaining opposite directions and noticing that cleaner tire sound corresponds to healthier drifting.

A beginner should be capable of spectacle almost immediately. They should not be capable of preserving momentum, placing the car precisely, or chaining the city cleanly without practice.

## 8. What mastery looks like

A beginner initiates early, holds large angles, makes several visible corrections, crosses grass, and exits wherever recovery happens to point them. Their run is dramatic but rhythmically uneven.

An expert:

- enters faster and later;
- chooses an angle appropriate to the corner rather than the largest available;
- places velocity before rotating the chassis;
- uses one deliberate set instead of repeated corrections;
- passes close to curbs, barriers, and buildings without relying on collision;
- unloads through neutral during transitions;
- releases Drift early enough to align before the road opens;
- preserves engine and vehicle momentum;
- makes the city feel like a continuous authored course.

The expert does not look less spectacular. They look calmer inside greater apparent danger.

## 9. One synchronized feedback system

Physics, animation, camera, audio, and VFX should describe the same event on the same timeline.

| Event | Physics/input | Camera/animation | Audio | VFX |
| --- | --- | --- | --- | --- |
| Grip loading | Steering load rises | Small body roll; stable close framing | Quiet precursor/front scrub | Little or no smoke |
| Breakaway | Drift phase begins; yaw authority rises | Body kick and restrained shake | Modal tire attack and broadband bite | Smoke and marks begin |
| Healthy sustain | Stable requested slip | Partial velocity alignment exposes angle | Clean 900–1,550 Hz tire modes | Consistent smoke and twin marks |
| Distress | High slip adds drag | More visible instability, never wild camera spin | Clean modes reduce; rasp/chatter increase | Denser smoke, messier path |
| Transition | Old slip unloads, opposite slip sets | Body crosses through neutral | 60–100 ms tire gap, thump, opposite attack | Marks briefly separate or pause |
| Hook-up | Heading and velocity converge | Subtle forward punch | Tire bite then engine prominence | Smoke stops; marks terminate cleanly |
| Collision | Momentum changes or reset occurs | Short shake | Impact transient and low thump | Existing scene remains readable |

Timing consistency matters more than adding more layers. If breakaway sound precedes rotation or smoke arrives late, the car feels mushy.

### Audio-specific direction

The current tire identity is procedural and reference-derived, not sample-based. A dedicated AudioWorklet generates continuously excited, unstable narrow modes from compact “tire DNA” profiles, plus scrub and chatter. This is the correct asset-free architecture unless playtesting proves that recognizability cannot be reached procedurally.

The tire sound should not be a triangle oscillator or broad filtered noise. Healthy drift emphasizes coherent modes; distress degrades them. Front scrub communicates steering load, rear modes communicate slip, and subtle stereo movement communicates drift direction.

The engine uses a separate reference-derived AudioWorklet. During heavy drift, an adaptive notch around 1.2 kHz opens space for tire information without removing engine weight. At maximum speed, overdrive, reduced engine load, RPM movement, and slow timbral wandering should prevent a static redline drone.

## 10. What to exaggerate—and what must remain believable

### Deliberately exaggerate

- Breakaway immediacy and its first fraction of a second of yaw authority.
- Recoverability at dramatic slip angles.
- The clarity of drift phases.
- Weight-transfer rhythm during transitions.
- Clean-exit acceleration payoff.
- Tire-state differences between loading, healthy drift, distress, and hook-up.
- Smoke, marks, body movement, and modest camera reaction as event punctuation.

### Keep believable

- Velocity must not instantly rotate with the chassis.
- More slip must eventually cost speed.
- Steering direction and path response must remain consistent.
- Recovery must take perceptible time.
- Transitions must pass through unloading rather than teleporting sides.
- Speed perception must agree across environment motion, camera, engine, road, and wind.
- Collision and world boundaries must remain spatially trustworthy.

The game may lie about force magnitude, but it must not lie about cause and effect.

## 11. What to remove or avoid

Do not add:

- mandatory manual throttle, brake, or reverse that displaces the accessible automatic default;
- mandatory objectives that make free driving feel like incomplete play;
- a speedometer merely because racing games usually have one;
- spin-outs from ordinary angle mistakes;
- random grip loss or hidden per-corner traction rules;
- drift scoring that becomes more important than the physical quality of a corner;
- giant camera pullback, extreme camera yaw, or layered shake that weakens spatial judgment;
- tire volume that only rises forever with slip;
- engine intensity that masks the exact tire information needed during a drift;
- full physics simulation complexity without a corresponding experiential benefit;
- visible profile selection for internal tuning presets;
- excessive traffic, props, or scenery that turns readable drift space into clutter.

More systems are not automatically more depth. Prefer richer consequences from the existing steering, Drift, and release decisions.

## 12. Experiential pillars

### 1. Controllable excess

Every dramatic motion should remain shapeable. If spectacle reduces authorship, it fails this pillar.

### 2. Player-authored drift shape

Entry, angle, line, transition, and release are the game. New mechanics should deepen those decisions rather than replace them.

### 3. Momentum has meaning

Shallow precision is faster; giant slides are viable but expensive. The player should feel speed being preserved, wasted, and recovered.

### 4. Synchronized state clarity

Hands, eyes, and ears should agree about grip, breakaway, sustain, distress, transition, and hook-up without requiring a HUD.

### 5. Immediate spectacle, durable mastery

A first attempt should look good. A hundredth attempt should be measurably cleaner, faster, closer, and more intentional.

## 13. Anti-pillars

The game must never become:

- **Wrestling with the car:** raw instability should not overwhelm intent.
- **Passive automated drifting:** assists stabilize a requested path; they do not choose entry, line, or exit.
- **Infinite free drift:** angle without momentum cost destroys grip-versus-drift judgment.
- **Unpredictable traction:** identical inputs in identical situations should produce understandable results.
- **Sensory chaos:** every layer cannot peak at breakaway, distress, and exit simultaneously.
- **A state-machine performance:** phases must blend through physical-looking momentum and remain adjustable.
- **An RC-car camera:** distance and excessive smoothing must not miniaturize the car.
- **A compulsory progression shell:** the driving toy must remain satisfying without rewards or objectives.

## 14. Contradictions and recommended directions

### Automatic throttle versus throttle mastery

Automatic remains the public default and the basis of the beginner experience. An unlockable desktop Manual scheme adds acceleration, braking, and reverse for players who deliberately discover it; its leaderboards remain separate so the default game is not quietly rebalanced around it.

**Direction:** preserve Automatic as the primary fantasy and keep Manual as an optional input policy over the same handling. Manual throttle must control every forward force, including clean-exit boost, while reverse remains slower and cannot enter the forward drift phases.

### Powerful assistance versus player authorship

Strong heading assistance can make every held drift converge on a pleasing angle, reducing the value of corrections.

**Direction:** assists should protect against abrupt spins and smooth convergence, but steering must materially alter target angle and line. Assistance should weaken in severe distress so excessive input has a visible cost without becoming unrecoverable.

### Dramatic angle versus optimal play

If large angle is always slow, experts may look conservative. If it is free, mastery collapses into holding maximum drift.

**Direction:** make moderate angle the cleanest and fastest, but ensure route geometry sometimes rewards a short aggressive rotation. Spectacle should be situationally useful, not merely tolerated.

### Generous recovery versus meaningful failure

If release always produces a perfect exit, hook-up stops being earned.

**Direction:** always permit recovery, but calculate its quality from alignment, duration, retained speed, and pavement. Poor exits survive while forfeiting boost, line, and rhythm.

### Tire-first mix versus powerful engine fantasy

Tires and engine overlap strongly around 800–1,600 Hz. Making tires readable can make the engine feel weak; preserving full engine mids can hide drift state.

**Direction:** use adaptive spectral space rather than broad engine volume reduction. Tires lead during loaded drift; engine low-end remains powerful and returns to prominence on hook-up.

### Expanded city versus readable high-speed space

More buildings create more routes but can turn every error into a reset and discourage experimentation.

**Direction:** preserve broad streets, open central drift lots, clear intersections, and predictable building boundaries. Add city density around driving space, not inside every recovery path.

### Rhythm versus repetition

The phase sequence repeats by design. Identical timing and sound on every corner would become mechanical.

**Direction:** keep phase rules consistent while allowing duration, angle, speed, load, line, tire profile, camera response, and exit quality to vary continuously. Predictable rules should produce varied performances.

## 15. Concise feel specification

- **When the player approaches a corner,** they should feel fast, planted, and responsible for deciding how unreasonable the entry will be.
- **When the player initiates a drift,** they should feel an immediate planted-to-sideways snap that confirms their input without threatening an arbitrary spin.
- **During the first 100–300 ms,** they should feel unusually strong authority to set the car’s angle and line.
- **During a stable drift,** they should feel relaxed inside visible danger, able to shape angle and trajectory with small, trustworthy corrections.
- **When they add unnecessary angle,** they should gain spectacle and rotation while hearing rougher tires and feeling momentum drain.
- **When they push too far,** they should feel messy, slow, and poorly positioned—not instantly disqualified.
- **During a transition,** they should feel the old side unload, a brief neutral beat, and the opposite side catch with rhythmic force.
- **When they release Drift,** they should trust that recovery begins immediately and progressively.
- **When the tires hook up,** they should feel lateral energy become forward acceleration, tire sound clear space for the engine, and the car fire toward the next corner.
- **At maximum speed,** they should feel sustained urgency without a static redline drone; environment, wind, overdrive engine behavior, and close camera motion should carry speed together.
- **After a perfect corner,** they should immediately want to connect the next one.

### Discipline checklist by system

- **Physics:** protect intent, preserve momentum, charge excessive angle, reward alignment.
- **Camera:** stay close, reveal slip and exit, react without becoming another unstable coordinate system.
- **Audio:** communicate state before spectacle; tires lead during drift, engine leads during acceleration and exit.
- **VFX:** show where force and slip occur; never hide the road.
- **Animation:** synchronize body kick, roll, pitch, steering, and transition load with physics events.
- **Level design:** offer readable approaches, multiple viable lines, alternating chains, open recovery space, and meaningful proximity risks.
- **UI:** teach the tiny control vocabulary and then get out of the way.

The final test is simple: the game succeeds when strong assistance is present everywhere but the player leaves every good corner believing, correctly, **“I did that.”**
