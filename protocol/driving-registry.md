# Driving v1 GameNet registry

Status: experimental multiplayer pilot.

- Game ID: `driving`
- Ruleset ID: `9df5a170286c459b8f20d733678b1e01`
- Normative payload schema: [`examples/driving-v1.cddl`](examples/driving-v1.cddl)

Published IDs are permanent within this game and are never reassigned.

## Input fields

| ID | Name | Meaning |
| ---: | --- | --- |
| 0 | `steering` | Finite intent from -1 (left) through 1 (right) |
| 1 | `throttle` | Finite intent from 0 through 1 |
| 2 | `brake` | Brake intent |
| 3 | `handbrake` | Handbrake/drift intent |

Clients send only these controls. Position, velocity, heading, collision, and speed are never trusted client input.

## Snapshot fields

| ID | Name | Meaning |
| ---: | --- | --- |
| 0 | `players` | At most eight authoritative player records |

### Player record fields

| ID | Name |
| ---: | --- |
| 0 | Player ID |
| 1 | X/Z position |
| 2 | X/Z velocity |
| 3 | Heading in radians |
| 4 | Nonnegative speed |

## Event variants

| ID | Name | Fields |
| ---: | --- | --- |
| 0 | `JOINED` | Player ID |
| 1 | `LEFT` | Player ID |
| 2 | `COLLISION` | Player ID and optional other player ID |

The pilot allocates no game-specific GameNet message types or feature IDs.
