# GameNet v1 permanent registry

Status: normative draft for protocol major 1.

Once an ID is published here, it is never reused for another meaning. Removed entries remain marked `RESERVED`. Decimal values are used throughout.

## Message types

| ID | Name | Direction | Channel | Meaning |
| ---: | --- | --- | --- | --- |
| 0 | `HELLO` | Client → host | Reliable | Offer protocol majors, game/ruleset identity, and capabilities |
| 1 | `WELCOME` | Host → client | Reliable | Select compatibility parameters and assign the player identity |
| 2 | `INPUT` | Client → host | Realtime | Send sequenced game input intent |
| 3 | `SNAPSHOT` | Host → client | Realtime | Publish authoritative state at a simulation tick |
| 4 | `EVENT` | Host → client | Reliable | Publish a discrete authoritative game event |
| 5 | `PING` | Either | Realtime | Request an RTT probe response |
| 6 | `PONG` | Either | Realtime | Respond to an RTT probe with the same request ID |
| 7 | `DISCONNECT` | Either | Reliable | Announce an intentional terminal close reason |
| 8 | `ERROR` | Host → client | Reliable | Report a protocol error before closing when required |
| 9–31 | `RESERVED CORE` | — | — | Reserved for future GameNet majors; not valid in v1 |
| 32–65535 | Game-specific | Negotiated | Registered by game | Requires an explicitly negotiated capability |

A v1 receiver rejects unknown message types unless their use was explicitly enabled by a negotiated capability. It never guesses channel semantics.

## Core field IDs

Field IDs are scoped to their message body but remain permanent within that scope.

### `HELLO`

| ID | Name | Required |
| ---: | --- | :---: |
| 0 | Supported protocol majors in preference order | Yes |
| 1 | Game ID | Yes |
| 2 | Ruleset ID | Yes |
| 3 | Supported feature IDs | No |

### `WELCOME`

| ID | Name | Required |
| ---: | --- | :---: |
| 0 | Selected protocol major | Yes |
| 1 | Assigned player ID | Yes |
| 2 | Confirmed game ID | Yes |
| 3 | Confirmed ruleset ID | Yes |
| 4 | Selected feature IDs | No |

### `INPUT`

| ID | Name | Required |
| ---: | --- | :---: |
| 0 | Input sequence | Yes |
| 1 | Game-defined input body | Yes |

### `SNAPSHOT`

| ID | Name | Required |
| ---: | --- | :---: |
| 0 | Authoritative simulation tick | Yes |
| 1 | Game-defined snapshot body | Yes |

### `EVENT`

| ID | Name | Required |
| ---: | --- | :---: |
| 0 | Authoritative simulation tick | Yes |
| 1 | Game-defined event body | Yes |

### `PING` and `PONG`

| ID | Name | Required |
| ---: | --- | :---: |
| 0 | Request ID echoed unchanged by `PONG` | Yes |

### `DISCONNECT`

| ID | Name | Required |
| ---: | --- | :---: |
| 0 | Disconnect code | Yes |
| 1 | Bounded diagnostic text for people; never parsed for behavior | No |

### `ERROR`

| ID | Name | Required |
| ---: | --- | :---: |
| 0 | Error code | Yes |
| 1 | Bounded diagnostic text for people; never parsed for behavior | No |

Unlisted nonnegative integer map keys are extension fields. Receivers ignore unknown extension fields after fully validating them against global decode limits. Duplicate map keys are invalid.

## Feature IDs

| ID range | Allocation |
| ---: | --- |
| 0–31 | Reserved for future GameNet core capabilities |
| 32–65535 | Available for documented game-specific capabilities |

No feature IDs are allocated in the initial v1 core. Absence of the feature list means an empty list.

## Error codes

| ID | Name | Terminal | Meaning |
| ---: | --- | :---: | --- |
| 0 | `NO_COMMON_PROTOCOL` | Yes | No offered protocol major is supported |
| 1 | `GAME_MISMATCH` | Yes | Game IDs differ |
| 2 | `RULESET_MISMATCH` | Yes | Ruleset IDs differ |
| 3 | `MALFORMED_MESSAGE` | Policy | CBOR or message structure is invalid |
| 4 | `LIMIT_EXCEEDED` | Policy | A packet or decoded value exceeds a specified bound |
| 5 | `UNEXPECTED_MESSAGE` | Policy | A valid message is not legal in the current phase or direction |
| 6 | `UNSUPPORTED_MESSAGE` | Policy | A message type was not negotiated or is reserved |
| 7 | `CHANNEL_MISMATCH` | Policy | A message arrived on the wrong DataChannel |
| 8–31 | `RESERVED CORE` | — | Not valid in v1 |

“Policy” means the receiver applies the strike policy defined in `README.md`; the same code becomes terminal when the strike limit is reached.

## Disconnect codes

| ID | Name | Meaning |
| ---: | --- | --- |
| 0 | `NORMAL` | Intentional local departure |
| 1 | `HOST_ENDED_SESSION` | The authoritative browser ended the game |
| 2 | `PROTOCOL_ERROR` | The connection is closing after a terminal protocol error |
| 3 | `TIMEOUT` | Liveness checks failed |
| 4–31 | `RESERVED CORE` | Not valid in v1 |

## Game-defined registries

Each game specification owns permanent registries for:

- fields inside its input, snapshot, and event bodies;
- event variants;
- game-specific message types from 32 upward;
- game-specific feature IDs from 32 upward;
- reserved retired IDs.

A ruleset ID identifies the exact game-level schema and simulation/content compatibility. Two games may use GameNet v1 without sharing any game-defined IDs or body structures.
