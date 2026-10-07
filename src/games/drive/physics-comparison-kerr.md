# Vehicle mechanics vs. Pat Kerr's 2D vehicle model

Reviewed 2026-10-07 against [Pat Kerr — 2D Vehicles](https://patkerr.co.uk/2d-vehicles/), the 1996 prototype that became the basis of *Grand Theft Auto*'s vehicles, recreated in JavaScript in 2026. Line references point to `simulation/vehicle-simulation.ts` as of commit `15c94ac`.

## Summary

Both models share the same core idea: velocity-proportional damping that strongly resists sideways motion and weakly resists rolling. Kerr builds everything from forces on a rigid body, so yaw, oversteer, and spin emerge. We apply that damping once at the centre of mass and author yaw directly: a yaw-rate target in grip, and a sideslip controller across the drift phases. That is deliberate (`design.md`: "player requests angle; invisible system stabilizes it"). The meaningful gaps are in collision response and timestep handling, not handling feel.

## Kerr's model

- **Rigid body.** Position, velocity, angle, and angular velocity. Forces through the centre move the body; off-centre forces also produce torque. Forces and torque are summed, velocities are updated, then position and angle advance in fixed time steps.
- **Tyres.** For each of four tyres, the velocity at the tyre position is split into a rolling component along the wheel heading and a lateral component across it. A small rolling resistance and a much stronger lateral resistance are applied, both proportional to velocity with no force cap. He calls it "technically incorrect" but "good enough": a damping model, not tyre friction, slip, or available grip.
- **Steering.** Changes the front wheel headings, so their forces turn the body.
- **Handbrake.** Increases rear rolling resistance and reduces rear lateral grip.
- **Barriers.** Point velocity (linear + angular). When the shell crosses an edge, it is pushed back inside and given a contact impulse if moving into the barrier, so off-centre impacts change velocity and spin. Edges are frictionless. When a flat face touches, the midpoint of the contacting points is used to avoid artificial spin from picking a single corner.
- **Modes.** Car, Ship, and Brick share the same physics core and differ only in how forces are applied.

## Comparison

| | Kerr | Drive |
|---|---|---|
| Body | Rigid body with mass/inertia; forces and torques integrated | Kinematic point with heading; velocity and yaw written directly, no mass or inertia |
| Tyre model | Per-tyre (×4) velocity split into rolling/lateral, proportional damping | Single lateral damping at the centre, `lateralSpeed * exp(-grip*dt)` (`:433-434`): Kerr's tyre model collapsed to one point |
| Yaw source | Emerges from off-centre front-tyre forces | Grip phase: target `steer * yawRate * speedRatio` (`:265`). Drift phases: PD controller toward a target slip angle (`:365`) |
| Low-speed steering | Vanishes naturally at standstill | `speedRatio` floored at 0.12 in automatic mode (`:254`), so the car can turn in place |
| Handbrake | Rear rolling resistance up, rear lateral grip down, so oversteer emerges | Triggers the grip → breakaway → sustain → transition → recover state machine with authored angles, impulses, and grip curves |
| Top speed | Emergent from drag | Drag alone gives a terminal speed of about 35 (16 / 0.46), but a hard clamp at 25 applies (`:440`) |
| Collisions | Point velocity + lever-arm impulse; off-centre hits spin; flat-face midpoint | 1.25-radius circle (`:19`); normal velocity reflected ×1.35 then speed ×0.58 (`:503-504`). Yaw is never affected. Car-to-car uses twin circles (`vehicle/collision.ts`), also linear only (`:121`) |
| Timestep | Fixed | Variable frame `dt` clamped to 50 ms in single-player (`runtime.ts:901-906`); collision substeps by distance (`:443`) |

## Where we are ahead

- **Exponential integration.** `exp(-k*dt)` grip and drag are unconditionally stable at high grip values and nearly framerate-independent, unlike explicit Euler.
- **Collision substepping.** Substepping by distance prevents tunnelling at speed; Kerr's simple barrier solver doesn't need it.
- **Authored drift.** The phase controller delivers the `design.md` pillars: direct authority over sideslip, readable phases, "yes, and" penalties, and buffered inputs. An emergent Kerr-style model would make 15–40° slides much harder to hold.

## Candidate improvements

1. **Angular response to impacts (cheap, high impact).** At the moment, clipping a building corner or another car never rotates you, and that rotation is the signature "GTA" feel. Without a full rigid body:
   - Model the car as a box, or reuse the twin-circle shape.
   - Compute the contact offset `r` from the centre.
   - Add `yawVelocity += cross(r, impulse) / I` with a tuned `I`.

   The drift controller's heading assist already pulls the car back. Consider clamping the effect or reducing it during `breakaway`.
2. **Fixed timestep with an accumulator.** `design.md` wants control that is "deterministic enough for self-competition", and there is a local leaderboard. Phase transitions use `phaseTime >= duration`, and `yawVelocity += a*dt` is explicit Euler, so 60 Hz and 144 Hz runs diverge slightly. A fixed step (e.g. 120 Hz with render interpolation) makes runs reproducible and matches the multiplayer `tick()`.
3. **Flat-face contact midpoint.** If collision moves from a circle to a box, average the contacting points along a flat face, as Kerr does, to avoid spurious spin when scraping along walls.
4. **Optional: per-axle lateral damping in the grip phase.** Splitting lateral damping between the front and rear axles would make yaw emerge from steering, giving natural understeer and oversteer without tuning `yawRate`. This is the most invasive option and risks the predictability `design.md` asks for, so try it only behind a driving-profile flag.

## Smaller notes

- The manual brake (`opposingDirections`) scales total speed, lateral component included. A Kerr-style brake would act through rolling resistance only, which preserves lateral slip under braking and allows trail-brake entries.
- The off-road grip and drag modifiers have no Kerr equivalent but fit naturally within his damping framing.
