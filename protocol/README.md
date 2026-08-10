# GameNet Protocol v1

Status: **normative draft**. The wire structure is defined by [`gamenet-v1.cddl`](gamenet-v1.cddl), permanent numeric assignments by [`registry.md`](registry.md), and protocol behavior by this document. TypeScript code implements these documents; it does not define the protocol.

## Foundation

```text
GameNet semantics       project-defined
CDDL schema             RFC 8610, updated by RFC 9682
CBOR wire encoding      RFC 8949 / STD 94
WebRTC or WebSocket     transport
```

CBOR is the only normative v1 encoding. CDDL is the normative schema language. Do not invent another binary codec or add MessagePack, Protobuf, or FlatBuffers without a later protocol-major decision backed by measured need.

A small implementation seam keeps transport and game code independent from CBOR library details:

```ts
interface ProtocolCodec<M> {
  encode(message: M): Uint8Array;
  decode(bytes: Uint8Array): DecodeResult<M>;
}
```

## Identity and negotiation

Compatibility has three independent dimensions:

- **protocol major:** whether peers understand the same network semantics;
- **features:** optional capabilities both peers support;
- **game and ruleset identity:** whether game schemas, content, and simulation rules are compatible.

The first client message must be one `HELLO` on the reliable channel. Before negotiation, the host accepts no other message. `HELLO` contains at most eight unique protocol majors and at most 64 unique feature IDs. The list of protocol majors is in client preference order.

The host validates the game and ruleset IDs, selects the first offered major it supports, intersects supported features, and replies with `WELCOME` on reliable. `WELCOME` confirms the game and ruleset IDs so the client fails closed if they differ from its request.

```text
client                                      host

HELLO
  supported protocol majors
  game ID
  ruleset ID
  supported features
                       ────────────────────►

                                      WELCOME
                                      selected protocol major
                                      player ID
                                      confirmed game/ruleset
                                      selected features
                       ◄────────────────────

                  protocol established
```

If compatibility fails, the host sends the applicable terminal `ERROR` when possible and closes. No gameplay message is legal before `WELCOME`. After `WELCOME`, packets do not repeat the major. A connection negotiates once; reconnecting starts a new negotiation.

A fundamental semantic change requires a new major. New optional behavior requires a feature ID. A different game-level schema or simulation/content compatibility requires a different ruleset ID.

## Wire format

One DataChannel or WebSocket message contains exactly one complete CBOR item with no trailing bytes:

```text
[message-type, message-body]
```

Message and evolving-record field names are nonnegative integer IDs. Fixed structures use arrays; evolving records use integer-keyed maps. Numeric IDs are a wire concern; source APIs retain meaningful names.

Example diagnostic notation for moving-circles input:

```text
[2, {
  0: 938,
  1: {0: [0.82, -0.20]}
}]
```

This means `INPUT`, sequence 938, with a game-defined direction vector. See [`examples/`](examples/) for a concrete CDDL extension and messages.

GameNet core exposes RFC 8610 type sockets for game-defined input, snapshot, and event bodies:

```cddl
$game-input /= circle-input
$game-snapshot /= circle-snapshot
$game-event /= circle-event
```

A game specification must extend all three sockets with one concrete body type and maintain its own permanent field/event registry. The ruleset ID identifies that compatibility contract. The simplified authoritative driving pilot is specified by [`examples/driving-v1.cddl`](examples/driving-v1.cddl) and [`driving-registry.md`](driving-registry.md). The extracted production mechanics use the separate [`examples/driving-production-v1.cddl`](examples/driving-production-v1.cddl) and [`driving-production-registry.md`](driving-production-registry.md) fixed ruleset. Public host-authoritative map transitions use [`examples/driving-configurable-v1.cddl`](examples/driving-configurable-v1.cddl) and [`driving-configurable-registry.md`](driving-configurable-registry.md).

## Channels and direction

The registry is authoritative for direction and channel placement:

| Message | Channel | Rationale |
| --- | --- | --- |
| `HELLO`, `WELCOME` | Reliable | Negotiation must arrive in order |
| `INPUT` | Realtime | New intent supersedes stale intent |
| `SNAPSHOT` | Realtime | New authoritative state supersedes stale state |
| `EVENT` | Reliable | Discrete authoritative outcomes must arrive |
| `PING`, `PONG` | Realtime | RTT probes must not wait behind reliable traffic |
| `DISCONNECT`, `ERROR` | Reliable | Terminal diagnostics should arrive when possible |

A message on the wrong channel or from the wrong direction is invalid. Game-specific message types 32 and above require both a documented game registry entry and an explicitly negotiated feature that defines direction and channel behavior.

Input sequences and simulation ticks are unsigned 32-bit counters that never wrap within a session. Inputs must increase monotonically per player; duplicates and older inputs are discarded. A session must restart before either counter is exhausted.

A `PONG` echoes the `PING` request ID unchanged. Unknown, duplicate, or late pong IDs have no state-changing effect.

Sending or receiving `DISCONNECT` is terminal. The sender closes after giving the reliable channel a bounded opportunity to flush; the receiver does not reconnect as part of v1 session semantics.

## Decode requirements and limits

Implementations reject a packet before exposing it to game code when any of these limits are violated:

| Limit | v1 value |
| --- | ---: |
| Realtime packet bytes | 16 KiB |
| Reliable packet bytes | 64 KiB |
| Nested array/map depth | 12 |
| Entries in one map | 256 |
| Items in one array | 1,024 |
| UTF-8 text bytes | 256 |
| Byte string bytes | 64 KiB |
| Protocol majors in `HELLO` | 8 |
| Feature IDs in negotiation | 64 |

Additional requirements:

- decode exactly one CBOR item and reject trailing data;
- reject invalid UTF-8, duplicate map keys, CBOR tags, and indefinite-length items;
- reject non-integer keys in protocol maps;
- accept integers only within the range required by CDDL;
- reject NaN and positive or negative infinity wherever a game schema accepts floats;
- enforce packet limits before allocation where the CBOR library permits;
- validate unknown fields against all global limits before ignoring them;
- do not coerce strings, booleans, integers, floats, arrays, maps, or byte strings between types.

A game schema may impose tighter limits. It may not relax core packet or structural limits.

## Invalid-message policy

During negotiation, one malformed, unexpected, oversized, or incompatible message is terminal. The receiver sends a bounded `ERROR` when safe and closes.

After negotiation, invalid messages are dropped before reaching simulation code. Three invalid messages from one peer within any rolling ten-second window are terminal. The receiver sends the most applicable `ERROR` and closes with `PROTOCOL_ERROR`. This strike policy covers malformed CBOR, limit violations, reserved or unnegotiated types, wrong direction, wrong channel, and phase-invalid messages.

Duplicate or stale `INPUT`, unknown/late `PONG`, and unknown optional fields are defined protocol conditions rather than strikes: they are ignored. Transport loss is not a protocol error.

Diagnostic text is optional, bounded, intended only for people, and never parsed to determine behavior. Implementations act on numeric error and disconnect codes.

## Evolution rules

| Change | Same major? |
| --- | ---: |
| Add an optional map field | Yes |
| Receive an unknown optional map field | Yes; validate then ignore |
| Add an optional feature | Yes |
| Add a message type used only after feature negotiation | Yes |
| Deprecate a field | Yes |
| Rename a source/schema field while preserving ID and meaning | Yes |
| Reuse a retired field, message, feature, event, or error ID | **Never** |
| Change the meaning of an existing ID | No |
| Change a field to an incompatible type | No |
| Change fundamental message semantics | No; new major |

Numeric IDs are permanent. Removed IDs remain `RESERVED`. Maps in the CDDL include an extension wildcard so old structural validators can accept added integer-keyed fields; semantic decoders still enforce duplicate-key, type, and size rules.

Unknown message types are not automatically forward-compatible because their direction, channel, and semantics are unknown. They are legal only when explicitly capability-negotiated.

## Open implementation boundary

> This game does not require our servers.
>
> This game does not require our networking implementation.

The durable compatibility artifacts are:

```text
protocol/
  README.md
  gamenet-v1.cddl
  registry.md
  codec-decision.md
  direct-invite.md
  examples/
```

A compatible implementation must be possible in any language with CBOR support by reading these files. Generated types and codecs are conveniences, not hidden normative artifacts.

## Future standards-based uses

These are not v1 gameplay requirements:

- deterministic CBOR can support ruleset hashes, state fingerprints, replay verification, signed manifests, and desync detection;
- CBOR Sequences (RFC 8742) can store appendable replay streams containing the same messages used live;
- CBOR diagnostic notation can document and debug exchanges without changing the wire format.

Live traffic does not use CBOR Sequences because its transport already provides framing. Deterministic encoding is required only for artifacts that need stable bytes or hashes, not every hot-path packet.

## TypeScript implementation

The first codec implementation lives in `src/net/protocol/`. [`codec-decision.md`](codec-decision.md) records the `cbor2` selection and strict decoder configuration. Tests cover independent diagnostic fixtures, semantic round trips, unknown optional fields, malformed CBOR, trailing data, duplicate keys, indefinite values, tags, non-finite numbers, packet and structural limits, channel placement, reserved types, and negotiation compatibility.

`HostRuntime` and `ClientRuntime` now live in `src/net/runtime/`. They depend only on `PeerConnection`, typed GameNet messages, `ProtocolCodec`, and a presentation-free `GameSimulation`. Their tests use the in-memory transport and the headless moving-circles simulation.

The browser conformance page now wires these runtimes to `WebRTCPeerConnection`, gives the host a loopback local client, renders authoritative moving-circle snapshots, and supports seven independent client slots without restarting the host simulation. The eight-player browser flow and isolated client removal have been exercised successfully.

[`direct-invite.md`](direct-invite.md) defines Direct Invite as the foundational connection ceremony. Its CDDL, registry, strict CBOR/fragment codec, response proof, one-use slot validation, link-only browser flow, and same-origin host-tab handoff are implemented. No `Signaler` is required; future automatic exchange remains optional. The next networking milestone is measuring real link handling and STUN-only connectivity before adding TURN.

## Standards references

- [RFC 8949: Concise Binary Object Representation (CBOR)](https://www.rfc-editor.org/rfc/rfc8949.html)
- [RFC 8610: Concise Data Definition Language (CDDL)](https://www.rfc-editor.org/rfc/rfc8610.html)
- [RFC 9682: Updates to CDDL](https://www.rfc-editor.org/rfc/rfc9682.html)
- [RFC 8742: CBOR Sequences](https://www.rfc-editor.org/rfc/rfc8742.html)
