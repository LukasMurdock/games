# Configurable Production Driving GameNet registry

Status: implementation draft; used by the public “Drive with friends” path.

- Game ID: `driving`
- Ruleset ID: `73a81f2c44e94b619207bc5510de8a03`
- Normative payload schema: [`examples/driving-configurable-v1.cddl`](examples/driving-configurable-v1.cddl)

This ruleset extends the fixed production vehicle payload with host-authoritative configuration epochs. The fixed ruleset remains unchanged.

## Additional reliable event

Event variant `3`, `CONFIGURATION`, carries the epoch, map ID, mode ID, profile ID, and control mode on the reliable channel. Repeated realtime snapshots carry the same state so late rendering and packet loss converge without treating the event as mutable truth.

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

Configurable player snapshots add field `9`, authoritative visual steering in `[-1, 1]` (`+1` left, `-1` right), so every client can render front-wheel steering without granting presentation authority. This intentionally converts the input convention (`-1` left, `+1` right) at the authoritative simulation boundary.

Clients never interpolate across different epochs. They rebuild the selected static world, repeatedly acknowledge the epoch, and retain the paused state until the host observes every connected player as ready. A departure removes that player from the readiness barrier.

Only the host may pause, configure, reset authoritative vehicles/spawns, and resume. The current multiplayer mode registry contains only `cruise`; Chase remains unavailable until its actors and rules are extracted into authoritative simulation state. All maps in the static `GAME_MAPS` catalog are selectable when their generated starting grid validates as clear pavement.
