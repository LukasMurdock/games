# Production Driving v1 GameNet registry

Status: implementation draft; headless runtime and interpolated browser conformance integration complete.

- Game ID: `driving`
- Ruleset ID: `422c7a11965d4e38b1d073f529a46c02`
- Normative payload schema: [`examples/driving-production-v1.cddl`](examples/driving-production-v1.cddl)

This ruleset uses the extracted production vehicle mechanics. It is distinct from the simplified driving pilot ruleset. Published IDs remain permanent within this ruleset.

## Input fields

| ID | Name | Meaning |
| ---: | --- | --- |
| 0 | `steering` | Discrete intent: -1 left, 0 neutral, 1 right |
| 1 | `throttle` | Finite intent from 0 through 1; reserved by the initial automatic-control composition |
| 2 | `brake` | Brake/reverse intent; reserved by the initial automatic-control composition |
| 3 | `handbrake` | Handbrake/drift intent |

Clients never send trusted position, velocity, heading, drift phase, boost, collision, or score.

## Snapshot fields

| ID | Name | Meaning |
| ---: | --- | --- |
| 0 | `players` | At most eight authoritative production vehicle records |

### Player record

| ID | Name |
| ---: | --- |
| 0 | Player ID |
| 1 | X/Z position |
| 2 | X/Z velocity |
| 3 | Heading in radians |
| 4 | Nonnegative speed |
| 5 | Signed visual slip in radians |
| 6 | Drift phase: `0` grip, `1` breakaway, `2` sustain, `3` transition, `4` recover |
| 7 | Boosting |
| 8 | Nonnegative exit pulse |

## Event variants

| ID | Name | Fields |
| ---: | --- | --- |
| 0 | `JOINED` | Player ID |
| 1 | `LEFT` | Player ID |
| 2 | `COLLISION` | Player ID, optional other player ID, terminal flag |

The ruleset allocates no game-specific GameNet message types or feature IDs. The initial composition is bound to Cruise, City Circuit, the `loose` profile, automatic controls, 60 Hz host ticks, 20 Hz snapshots, and an eight-position deterministic starting grid. Public driving-page UI integration remains deferred.
