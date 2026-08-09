# Multiplayer architecture proposal

Status: research and design only. This document does not make multiplayer part of the public game.

Research date: August 9, 2026. Four Codex CLI research passes reviewed this repository, current Cloudflare Durable Objects documentation, legacy and current PartyKit, and [`cloudflare/cloudflare-os`](https://github.com/cloudflare/cloudflare-os) at commit [`1cb5e3d`](https://github.com/cloudflare/cloudflare-os/commit/1cb5e3d9096589e38f3fcfaf3f2191aa95a4c592). Raw local reports are in `/tmp/durable-objects-multiplayer-research.md`, `/tmp/partykit-multiplayer-research.md`, `/tmp/cloudflare-os-architecture-research.md`, and `/tmp/cloudflare-os-driving-relevance.md`.

## Decision

Use one Cloudflare Durable Object per room and raw Durable Object WebSocket Hibernation APIs for the production transport.

The public Worker is a narrow gatekeeper. It validates HTTP requests, applies coarse rate limits, and uses typed Durable Object RPC for room control operations. The room object owns WebSocket admission through `fetch()`, accepts sockets with `ctx.acceptWebSocket()`, and handles game frames through `webSocketMessage()`.

Do not build on legacy managed PartyKit, browser-facing Cap'n Web RPC, or PartyServer by default. PartyServer remains a valid disposable implementation spike, and PartySocket may still be evaluated independently as a reconnecting browser client. Either is adopted only if it passes the game's hibernation, authentication, stale-input, bounded-decoding, backpressure, and close-code tests without leaking framework types into the simulation or protocol.

This changes the earlier PartyServer-first recommendation. Cloudflare OS demonstrates direct Worker-to-DO RPC, restoration, capability, testing, and observability patterns, but does not use native hibernating sockets for its application RPC and therefore does not validate that topology for high-frequency gameplay. Raw APIs make the critical lifecycle explicit and remove a pre-1.0 server abstraction without changing network latency.

The player who creates a room is a lobby administrator, not the simulation host. The Durable Object is always authoritative. If the creator leaves, administration can transfer without any physics host migration.

## What to learn from Cloudflare OS

Cloudflare OS is a collaborative capability system, not a multiplayer game. Its exact frontend and RPC topology should not be copied, but several structural patterns are directly useful.

### Adopt

- **One authority per collaboration unit.** Its `OverseerDurableObject` owns one workspace. Our `PvpRoom` owns one room, with no global matchmaking or registry object.
- **A public gatekeeper in front of private state.** Its [`router`](https://github.com/cloudflare/cloudflare-os/blob/1cb5e3d9096589e38f3fcfaf3f2191aa95a4c592/packages/router/src/index.ts) allowlists backend routes and otherwise serves assets. We keep this boundary in one deployment initially.
- **Typed Worker-to-DO RPC.** HTTP control operations use a private room stub; only the socket upgrade goes through `PvpRoom.fetch()`.
- **Durable truth versus provisional streams.** Cloudflare OS distinguishes durable chat messages from restart-sensitive stream output using a stream generation. We use `roomGeneration`, `epoch`, and server sequence so reconnecting clients discard unsafe predictions and provisional effects.
- **Opaque, hashed capabilities.** Its workspace share keys and account sessions store hashes rather than bearer secrets. We use room-local, single-use admission tickets and separately hashed reconnect secrets.
- **State before side effects.** Its scheduler persists run identity before crossing RPC boundaries. We commit room admission and authoritative outcomes before broadcasting or launching best-effort telemetry.
- **One alarm scheduler.** Calculate the earliest room-expiry or seat-grace deadline. Alarms recover lifecycle work; they never tick physics.
- **Generated Worker types and real-runtime tests.** Commit Wrangler-generated binding types and test under `@cloudflare/vitest-pool-workers`, including forced object eviction with surviving hibernating sockets.
- **Bounded structured observability.** Re-establish context for every socket event and alarm, reserve secret-bearing field names, and aggregate high-frequency metrics rather than logging ticks.

### Adapt

- **Capabilities become connection-bound roles.** Cloudflare OS can return restricted RPC interfaces. A game socket instead serializes bounded identity and role metadata in its attachment, then authorizes every command against durable seat state.
- **Recovery restarts a match epoch.** Cloudflare OS can resume durable agents. Version one of the game should not persist or resume every physics tick; unexpected active-room reconstruction respawns players in a new epoch.
- **Package boundaries stay lightweight.** Copy the separation between frontend, shared contracts, backend, and integration tests, not its large monorepo or dynamic Worker-loading infrastructure.
- **Best-effort projections stay non-authoritative.** If room discovery or aggregate stats are added later, they may live in KV, D1, or another DO, but opening a room must repair from the room's own truth.

### Reject

- Cap'n Web and promise-pipelined browser RPC for gameplay frames.
- Dynamic gadget loading, sandboxed gadget iframes, gatekeeper packages, Yjs, and capability graphs.
- A generic typed-storage/index framework for four small room tables.
- Whole-object aborts for ordinary player removal; close only that player's sockets.
- Separate router and backend Workers until scale, abuse isolation, or deployment independence proves the need.
- Alarms, Queues, or Workflows anywhere in the input, physics, collision, or snapshot hot path.

## Product shape

The initial private release should support:

- two to four players, with eight as a later measured target;
- an eight-character human-friendly room code displayed as `ABCD-EFGH`;
- one locked map, profile, and control policy per match;
- creator/admin controls for settings, start, removal, and room closure;
- server-authoritative movement and collisions;
- immediate local prediction;
- interpolated remote cars;
- player-scoped resets;
- short reconnect grace and spawn protection;
- no mutable or resettable world state.

A room code is a locator, not authentication. A join request exchanges the code for a short-lived room- and player-bound capability. A reconnect secret stays in `sessionStorage` or a secure same-origin cookie rather than in the invite URL.

## Authority and reset semantics

The Durable Object owns:

- fixed simulation tick and match clock;
- map, handling profile, phase, and room capacity;
- every player's physical state and current controls;
- static-world and vehicle collision decisions;
- spawn selection, reset serials, and scores;
- lobby membership and role assignment.

Clients send input intent only. They never submit trusted position, velocity, collision, spawn, reset, score, or match state.

The existing `endDrive()` operation is session-wide and must not be reused for PvP contact. Multiplayer adds an explicit server operation:

```ts
resetPlayer(playerId, reason, authoritativeSpawn)
```

A static obstacle or boundary resets only that player. Mild car contact separates and applies a bounded impulse. A severe contact produces one or more targeted reset events based on deterministic impact rules. If both cars independently qualify, both receive player-scoped resets; the map, room clock, props, and uninvolved players continue unchanged.

Every reset contains a monotonic `resetSerial` and stable collision ID so duplicate network delivery cannot reset a player twice. A reset grants roughly 750–1,000 ms of server-owned spawn protection and temporary vehicle ghosting to prevent chain collisions.

## Simulation extraction is the prerequisite

Networking should not begin by sending the current `PlayerSnapshot`. `player-controller.ts` mixes physics with Three.js, render-frame timing, audio, smoke, skid marks, camera feedback, and browser input timing. It cannot run authoritatively in a Worker.

Extract a presentation-free simulation first:

```text
src/lib/driving-game/
├── simulation/
│   ├── types.ts                 Plain numeric state and input
│   ├── math.ts                  Vec2 and angle helpers
│   ├── step-vehicle.ts          Fixed-step arcade vehicle update
│   ├── collision-world.ts       Static collision against a manifest
│   ├── collision-vehicle.ts     Paired-circle narrow phase
│   ├── reset-player.ts          Player-scoped reset rules
│   └── match-engine.ts          Roster, ticks, pairs, events, snapshots
├── map-manifest/
│   ├── collision-manifest.ts    Compact server-safe map geometry
│   └── manifest-hash.ts         Canonical client/server compatibility hash
├── network/
│   ├── protocol.ts              Shared plain data and bounded decoders
│   ├── room-code.ts             Generate, normalize, and format codes
│   ├── transport.ts             Framework-neutral client interface
│   ├── loopback.ts              Local multiplayer test transport
│   ├── websocket.ts             Browser-only production transport
│   ├── clock-sync.ts
│   ├── prediction.ts
│   └── snapshot-buffer.ts
├── vehicle/
│   └── remote-car-view.ts       Remote mesh and effects presentation
└── modes/pvp/
    ├── index.ts
    ├── pvp-controller.ts
    ├── pvp-hud.ts
    ├── lobby-controller.ts
    └── remote-player-registry.ts

worker/
├── index.ts                     Public gatekeeper and asset fallback
└── drive/
    ├── pvp-room.ts              Authoritative Durable Object
    ├── room-storage.ts          Direct SQLite schema and migrations
    ├── admission.ts             Opaque ticket issue and verification
    ├── socket.ts                Hibernating socket helpers
    ├── rate-limit.ts            Exact room/connection limits
    └── observability.ts         Bounded structured room telemetry
```

Do not add an ECS, actor hierarchy, or generic multiplayer framework. `match-engine.ts` is a driving-specific set of vehicle states. `remote-player-registry.ts` is a PvP presentation concern, not a generic actor registry.

The browser's existing `PlayerController` becomes a presentation/input adapter around the shared simulation. Audio, smoke, skid marks, wheel animation, and camera feedback consume simulation events but never modify physical state.

Map authoring remains the source of truth. A build-time or import-time compiler emits a compact collision manifest of static obstacles, pavement, boundary, spawn slots, and a stable hash. Both browser and Worker consume that manifest. Visual Three.js construction remains browser-only.

Exact bit-level browser/Worker determinism is not required because the server reconciles clients, but the same initial state and input trace should remain numerically close and produce the same discrete events. Use plain numbers, fixed steps, stable player-ID ordering, and no `performance.now()`, random physics, DOM, audio, or Three.js dependencies in the simulation package.

## Runtime composition

Multiplayer is a session/transport concern; PvP is a game mode.

The top-level runtime should eventually compose either:

```text
OfflineSession
  └── local simulation + Cruise/Chase controller

NetworkSession
  ├── room transport
  ├── local predicted simulation
  ├── authoritative reconciliation
  └── PvP mode controller + remote views
```

Do not force Cruise and Chase through network abstractions. Do not make the creator's browser a special simulation path. The PvP controller receives a narrow network session service and a remote-player registry while existing modes retain their current offline context.

## Network timing

Recommended first tuning:

| Concern | Initial value |
|---|---:|
| Authoritative physics | fixed 60 Hz |
| Client input frames | 30 Hz, plus immediate changes |
| Server snapshots | 20 Hz |
| Local prediction/render | display refresh |
| Remote interpolation | 100 ms adaptive buffer |
| Maximum extrapolation | 100–150 ms |
| Reconnect seat grace | 15–30 seconds |
| Initial room capacity | 4 |

A 60 Hz server step preserves the current handling resolution and reduces tunneling for paired-circle collisions. Client prediction hides local input latency, so snapshots do not need to run at render frequency.

An active match should use a self-scheduled fixed-step loop and accept that the Durable Object remains active and billable. Stop the loop when the room is only a lobby, paused, or empty so Hibernation can evict memory. Do not use Durable Object alarms as physics ticks. Alarms handle room expiry and abandoned-seat deadlines.

Cap catch-up work after a delayed event. A room that cannot sustain its tick budget should report an overrun rather than attempting an unbounded simulation burst.

## Prediction, reconciliation, and interpolation

The local browser:

1. samples input into a numbered state frame;
2. applies it immediately to the local predicted simulation;
3. retains unacknowledged frames;
4. receives the authoritative state and last processed sequence;
5. rewinds to the authoritative state;
6. reapplies newer inputs;
7. visually smooths small corrections over roughly 80–120 ms;
8. snaps immediately for resets, epoch changes, or unsafe divergence.

Remote vehicles render from a timestamped snapshot buffer slightly in the past. Short gaps may extrapolate conservatively, but a remote car should freeze or coast after the maximum window rather than diverging indefinitely.

Do not rewind solid vehicles for lag-compensated collisions. Server-current collision state is more understandable than being reset by a car that no longer appears nearby. Casual room consistency is more important than aggressive shooter-style lag compensation.

## Protocol

Start with compact, versioned JSON while measuring CPU and bandwidth. Use Zod for lobby/control messages and a bounded hot-path decoder for frequent input. Move snapshots to binary only if profiling justifies the complexity.

Client messages:

```ts
type ClientMessage =
  | { v: 1; t: "ready"; commandId: string }
  | { v: 1; t: "input"; seq: number; clientTick: number; buttons: number }
  | { v: 1; t: "resync"; lastServerTick: number }
  | { v: 1; t: "ping"; id: number; clientTime: number };
```

Server messages:

```ts
type ServerMessage =
  | {
      v: 1;
      t: "welcome";
      roomGeneration: number;
      epoch: number;
      connectionId: string;
      playerId: string;
      tick: number;
      mapId: GameMapId;
      mapHash: string;
      profileId: DrivingProfileName;
    }
  | { v: 1; t: "presence"; joined: PlayerMeta[]; left: string[] }
  | { v: 1; t: "snapshot"; epoch: number; tick: number; players: NetPlayerState[] }
  | { v: 1; t: "match-restarted"; epoch: number; tick: number; reason: "room-recovery" }
  | {
      v: 1;
      t: "reset";
      collisionId: string;
      playerId: string;
      resetSerial: number;
      tick: number;
      reason: "world" | "boundary" | "vehicle";
      spawn: NetTransform;
    }
  | { v: 1; t: "pong"; id: number; clientTime: number; serverTime: number }
  | { v: 1; t: "error"; code: string; terminal: boolean };
```

Input is a current control bitset, not raw keyboard events. Identity comes from the authenticated WebSocket connection, never the payload. Each `NetPlayerState` carries `ackSeq`, the latest accepted input for that player. Sequences are nonnegative safe integers and reset on epoch change. Collision IDs derive deterministically from epoch, tick, sorted player IDs, and a contact serial.

Decoders bound frame bytes, object depth, array lengths, player count, strings, integer ranges, and finite numeric values. Invalid hot-path input is dropped or closes the connection according to a documented strike policy. Batch input changes and server events where useful to reduce WebSocket runtime context switches.

Reconnection must not replay stale driving input. Clear queued input, authenticate again, receive a full snapshot, discard prediction history, and then send only the current control state. Terminal close codes stop retries. Reliable lobby commands use idempotency IDs.

## Room routing and codes

Suggested same-origin routes:

```text
POST /api/drive/rooms
POST /api/drive/rooms/:code/join
POST /api/drive/rooms/:code/reconnect
POST /api/drive/rooms/:code/settings
POST /api/drive/rooms/:code/leave
GET  /api/drive/rooms/:code/socket
```

The boundary is explicit:

```text
Browser
  └─ public Worker: origin, method, size, schema, coarse rate limit
       ├─ HTTP control → typed PvpRoom RPC
       └─ socket upgrade → sanitized PvpRoom.fetch()
                            └─ room rechecks ticket, generation, seat, and capacity
```

Generate codes from an alphabet without ambiguous characters. Eight base-32 characters provide about 40 bits of room space. Format the display with a hyphen, but normalize before lookup.

Admission uses a 192-bit random, single-use ticket expiring after roughly 30 seconds. The room stores only a domain-separated hash plus player ID, generation, role, protocol version, expiry, and consumption time. Prefer delivery through a Secure, HttpOnly, SameSite cookie scoped to the room API path. A longer-lived reconnect secret is stored hashed, remains separately revocable, and can only be exchanged for a fresh admission ticket. Neither secret belongs in a query string.

The Worker blocks cheap abuse, but the room remains authoritative and fails closed if admission cannot be evaluated. Unknown, expired, wrong-room, consumed, wrong-generation, and wrong-protocol tickets return indistinguishable external failures where usability permits.

There is no global room directory in the first version. Deterministic name lookup avoids an extra stateful hop. The room initialization RPC atomically claims an unused code or rejects it so the creator can retry with a new random code.

## Durable Object placement and fastest shared experience

A room is placed near the request that first creates its Durable Object and does not currently relocate. Therefore:

- let the creator's real create request instantiate the object;
- never pre-create rooms from CI, an alarm, or an admin location;
- default to creator-near placement for local friend groups;
- measure and show each participant's RTT in the lobby;
- add an explicit broad region selector only after geographically distributed play is observed;
- warn before starting a room with extreme RTT spread.

Location hints are best effort. Jurisdictions are compliance restrictions, not latency controls. A single authoritative room cannot remove intercontinental speed-of-light latency.

## Hibernation, persistence, and room lifecycle

Use Cloudflare's native WebSocket Hibernation API. Accept each socket with `ctx.acceptWebSocket()` and serialize only bounded connection identity such as `{ playerId, connectionId, roomGeneration, protocolVersion }`. Attachments are not reconnect authority and never contain bearer secrets. Durable seat rows remain authoritative.

Class fields disappear when an idle room hibernates. The constructor reloads and migrates durable metadata, recovers sockets with `ctx.getWebSockets()`, and rebuilds ephemeral indexes. If durable phase is `active` after unexpected reconstruction, atomically increment the epoch, clear controls, respawn players, and emit `match-restarted`.

Initial direct SQLite schema:

```text
room(
  singleton, schema_version, generation, phase, epoch,
  created_at, expires_at, map_id, map_hash, profile_id,
  control_policy, capacity, admin_player_id, room_log_id
)

seats(
  player_id, role, display_name, reconnect_hash,
  joined_at, disconnected_at, reset_serial, last_input_seq
)

admission_tickets(
  ticket_hash, player_id, generation, protocol_version,
  expires_at, consumed_at
)

results(epoch, finished_at, result_json)
```

Do not persist sockets, current controls, per-tick states, snapshots, simulation accumulators, token buckets, or every input. Add periodic compact physics checkpoints only if measured deploy/restart disruption warrants their cost and complexity.

Suggested lifecycle:

- disconnected seat grace: 15–30 seconds;
- empty active room: stop simulation immediately;
- empty room expiry: 15–60 minutes;
- one Durable Object alarm schedules the next room/seat deadline;
- alarm handlers are idempotent.

## Security, abuse, and backpressure

- Exact origin checks before WebSocket upgrade.
- Opaque, hashed, room-local admission and reconnect capabilities.
- Secure same-origin anonymous identity cookie or equivalent session.
- No trusted client transforms, collisions, resets, scores, or settings.
- Maximum input frame around 1 KiB and approximately 40 accepted input frames/sec with a small burst.
- Monotonic sequence checks and bounded tick windows.
- Strict room capacity and display-name limits.
- Per-identity and per-IP creation quotas, maximum live rooms per identity, and bounded unauthenticated upgrade attempts.
- Coarse edge limits for creation, code guessing, joins, and upgrades; exact in-room token buckets per connection.
- One active socket per seat with an explicit replace-old policy.
- Bounded messages per event and bounded pending lobby commands.
- Coalesce or drop obsolete snapshots for slow consumers, then close persistently lagging clients.
- Do not automatically retry errors marked overloaded; retries amplify overload.
- Terminal close codes for invalid version, deleted room, expired capability, or abuse.
- `Cache-Control: no-store` on admission responses.
- Turnstile only for creation or repeated suspicious joins, not routine reconnects.
- Never log raw capabilities, reconnect credentials, cookies, input bodies, or full socket URLs.

## Deployment in this repository

Keep one Worker deployment initially. Add a Worker entrypoint while continuing to serve Astro assets:

```text
lukasmurdock.com
├── static assets and pages
└── /api/drive/rooms/*
```

The future Wrangler configuration needs:

- `main: "worker/index.ts"`;
- an assets binding and `run_worker_first` limited to `/api/drive/*`;
- an explicit `PVP_ROOMS` binding to a SQLite-backed exported `PvpRoom`;
- declarative Durable Object class export if supported by the installed Wrangler schema;
- rate-limit bindings for create and join/upgrade;
- observability with low production trace sampling;
- distinct staging Worker, route, and Durable Object namespace;
- checked-in generated `worker-configuration.d.ts` plus a CI freshness check.

Opaque room-local tickets remove the need for room-naming and capability-signing secrets. Do not copy Cloudflare OS's dynamic entrypoint generation or release machinery; one explicit room class and a normal staged deployment are enough. Verify current Wrangler migration syntax before creating the first production namespace because declarative exports and legacy migration arrays are mutually exclusive.

## Observability

Log bounded lifecycle events using a random `roomLogId`, not the room code:

- room created, initialized, started, restarted, ended, and expired;
- player join, reconnect, disconnect, replacement, and terminal close using an opaque player ordinal;
- ticket and rate-limit rejection categories without bearer material;
- one aggregate active-play report about every ten seconds containing player count, tick-duration histogram, overruns, maximum catch-up steps, input accept/reject counts, snapshot bytes, correction-distance buckets, RTT buckets, and slow-consumer actions.

Never emit per-tick logs. Re-establish observability context for each HTTP request, RPC, WebSocket event, alarm, and post-hibernation activation; ambient context does not survive those boundaries.

## Testing and launch gates

Pure simulation tests:

- fixed-step output independent of render cadence;
- same input trace produces the same discrete events;
- static collision resets only the affected player;
- vehicle collision never invokes a room/world reset;
- reset and collision events are idempotent;
- deterministic player-pair ordering;
- protected spawns cannot immediately collide;
- stable map manifest hashes.

Protocol tests:

- malformed, oversized, duplicate, stale, future, and out-of-order input;
- explicit version rejection;
- reconnect discards stale input;
- full snapshot and resync behavior;
- terminal close codes stop reconnection.

Durable Object integration tests use `@cloudflare/vitest-pool-workers` and the real Worker routes:

- room isolation by code;
- create/join races, single-use ticket races, and capacity;
- invalid/cross-room capability rejection;
- forced eviction with hibernating sockets followed by a message;
- constructor recovery and serialized-attachment validation;
- duplicate or delayed alarms, expiry, and reconnect grace;
- object restart and epoch change;
- per-player revocation without disrupting other sockets;
- schema migration of an existing room;
- targeted collision/reset broadcasts;
- static asset fallback alongside room routes;
- generated Worker binding types remain current.

Browser/network tests:

- two to eight isolated contexts;
- 50, 100, and 200 ms RTT plus jitter/stalls;
- refresh, offline/online, background tabs, and server deploy;
- mobile touch prediction;
- stale map hash;
- one player collision while every other player and the world continue.

Release gates should use measured P95 room RTT, correction distance, tick overruns, snapshot bytes, abnormal disconnects, and reconnect success rather than local feel alone.

## Incremental implementation

1. **Extract the headless simulation.** Preserve current driving feel with recorded input traces.
2. **Compile map collision manifests.** Remove Three.js from the shared schema, then hash and validate browser/server parity.
3. **Add targeted reset semantics and a loopback transport.** Build two-player PvP, remote cars, collision IDs, reset serials, interpolation, and prediction without Workers.
4. **Add the Worker control plane.** Create the entrypoint, raw `PvpRoom`, direct SQLite schema, generated types, opaque admission tickets, and room lifecycle without active physics.
5. **Add hibernating lobby sockets.** Test capacity, single-use admission, reconnect, alarms, forced eviction, and restoration.
6. **Ship non-colliding ghosts privately.** Add bounded observability and measure real RTT, message rates, and smoothing.
7. **Run shadow authority.** Compare server simulation to client prediction without enforcing it.
8. **Enable authoritative movement.** One map, one profile, automatic controls, four players.
9. **Enable server-owned PvP collisions.** Add spawn protection and targeted reset telemetry.
10. **Canary and expand.** Move toward eight players and additional maps only after profiling.

The first engineering milestone should be a pure, fixed-step driving simulation with targeted resets and deterministic replay tests. Sockets and lobby UI come after that boundary is proven.

## Primary sources

- [Cloudflare Durable Objects overview](https://developers.cloudflare.com/durable-objects/)
- [Durable Object namespace and naming](https://developers.cloudflare.com/durable-objects/api/namespace/)
- [Durable Object WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Durable Object lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)
- [Durable Object data location](https://developers.cloudflare.com/durable-objects/reference/data-location/)
- [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Workers Static Assets routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
- [Workers Vitest integration and test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)
- [Durable Object error handling](https://developers.cloudflare.com/durable-objects/best-practices/error-handling/)
- [Cloudflare OS repository at the researched commit](https://github.com/cloudflare/cloudflare-os/tree/1cb5e3d9096589e38f3fcfaf3f2191aa95a4c592)
- [Cloudflare OS integration testing](https://github.com/cloudflare/cloudflare-os/blob/1cb5e3d9096589e38f3fcfaf3f2191aa95a4c592/docs/integration-testing.md)
- [Cloudflare OS sharing and capability design](https://github.com/cloudflare/cloudflare-os/blob/1cb5e3d9096589e38f3fcfaf3f2191aa95a4c592/docs/sharing.md)
- [Cloudflare PartyKit repository](https://github.com/cloudflare/partykit)
- [PartyServer package](https://github.com/cloudflare/partykit/tree/main/packages/partyserver)
- [PartySocket package](https://github.com/cloudflare/partykit/tree/main/packages/partysocket)
- [Legacy PartyKit documentation](https://docs.partykit.io/)
