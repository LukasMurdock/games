# Configurable Production Driving GameNet registry

Status: implementation draft; used by the public “Drive with friends” path.

- Game ID: `driving`
- Ruleset ID: `ecb64629e79f023b280bb0186e8dc3b1`
- Normative payload schema: [`examples/driving-configurable-v2.cddl`](examples/driving-configurable-v2.cddl)
- Superseded Cruise-only ruleset ID: `73a81f2c44e94b619207bc5510de8a03`
- Superseded schema: [`examples/driving-configurable-v1.cddl`](examples/driving-configurable-v1.cddl)

The ruleset ID changed when Chase became authoritative so a stale Cruise-only client fails negotiation instead of joining without police presentation or capture state.

This ruleset extends the fixed production vehicle payload with host-authoritative configuration epochs. The fixed ruleset remains unchanged.

## Additional reliable events

Event variant `3`, `CONFIGURATION`, carries the epoch, map ID, mode ID, profile ID, and control mode on the reliable channel. Repeated realtime snapshots carry the same state so late rendering and packet loss converge without treating the event as mutable truth.

Event variant `4`, `CHASE_CAPTURED`, carries the captured player ID and authoritative team survival time. It drives one-shot impact and capture presentation; repeated Chase snapshots remain the source of current round truth.

## Additional input field

| ID | Name | Meaning |
| ---: | --- | --- |
| 4 | `ready-epoch` | Client confirms that its world for this configuration epoch is loaded |

Readiness intent is repeated with realtime control input until authoritative snapshots advance. It is idempotent and cannot select configuration.

## Additional snapshot fields

| ID | Name | Meaning |
| ---: | --- | --- |
| 1 | `configuration-epoch` | Monotonically increasing host configuration generation |
| 2 | `paused` | Whether vehicle advancement is paused |
| 3 | `map-id` | Selected registered map |
| 4 | `mode-id` | Selected multiplayer-compatible mode |
| 5 | `profile-id` | Selected handling profile |
| 6 | `control-mode` | `0` automatic or `1` manual |
| 7 | `pursuers` | Up to six host-simulated police actors with target and presentation state |
| 8 | `chase` | Chase round phase, survival time, nearest distance, reinforcement notice, and optional captured player |

Configurable player snapshots add field `9`, authoritative visual steering in `[-1, 1]` (`+1` left, `-1` right), so every client can render front-wheel steering without granting presentation authority. This intentionally converts the input convention (`-1` left, `+1` right) at the authoritative simulation boundary.

Clients never interpolate across different epochs. They rebuild the selected static world, repeatedly acknowledge the epoch, and retain the paused state until the host observes every connected player as ready. A departure removes that player from the readiness barrier.

Only the host may pause, configure, reset authoritative vehicles/spawns, and resume. The multiplayer mode registry contains `cruise` and `chase`. Chase uses a shared host-authoritative police pool, deterministic target hysteresis, player-count and time-based reinforcement scaling, team capture, and synchronized round resets. Clients render interpolated police state but never decide pursuit, collision, capture, or score. All maps in the static `GAME_MAPS` catalog are selectable when their generated starting grid validates as clear pavement.
