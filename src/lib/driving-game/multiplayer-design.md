# Multiplayer architecture

Status: production Direct Invite multiplayer integrated as a separate public Cruise path; existing local modes remain unchanged.

## Decision

Build one small networking kernel around a host-authoritative star topology:

```text
DirectInviteCodec
  └─ WebRTC PeerConnections
       ├─ client
       ├─ client
       └─ client
            ↕
        HostRuntime
            ↕
       GameSimulation
```

Version one is a static website using self-contained Direct Invite links, WebRTC, and a browser-hosted authoritative simulation. It has no database, accounts, matchmaking, persistence, dedicated server, host migration, peer mesh, or deployment tunnel.

The host browser is authoritative. Clients send inputs and intentions; the host sends state and events. If the host leaves, the game ends.

## Architectural seams

Only abstractions known to vary belong in the kernel.

### DirectInviteCodec

Direct Invite is the foundational connection ceremony, not a fallback signaler. Each invite creates exactly one peer slot and one `RTCPeerConnection`. The host sends a self-contained invite link through an existing social channel; the friend returns a self-contained response link through the same channel.

```text
host ── #invite=<CBOR> ──► friend
host ◄─ #response=<CBOR> ─ friend
host ═══════ WebRTC ═════ friend
```

The player's messaging app is the exchange mechanism. Version one needs no `Signaler`, room service, rendezvous process, account, or lobby database.

`DirectInviteCodec` owns bounded CBOR/base64url encoding, format versioning, one-use session/slot binding, and response proof verification. It does not own WebRTC or gameplay. The open format and browser handoff behavior are specified in [`protocol/direct-invite.md`](../../../protocol/direct-invite.md).

Future automatic rendezvous may exchange these exact invite/response envelopes as a convenience. It is not foundational and cannot become a requirement for private direct-link play.

### PeerConnection

Gameplay code never accesses `RTCPeerConnection` directly.

```ts
interface PeerConnection {
  readonly peerId: string;

  sendReliable(data: Uint8Array): void;
  sendRealtime(data: Uint8Array): void;

  onReliable(handler: (data: Uint8Array) => void): void;
  onRealtime(handler: (data: Uint8Array) => void): void;

  close(): void;
}
```

`WebRTCPeerConnection` owns two data channels:

- `reliable`: ordered and retransmitted;
- `realtime`: unordered and disposable.

A future dedicated server can provide `WebSocketPeerConnection` while retaining the gameplay protocol.

### HostRuntime

The simulation is presentation-free and does not know whether it runs in a browser or a server process.

```ts
interface GameSimulation<Input, State> {
  create(config: GameConfig): State;
  addPlayer(state: State, playerId: string): void;
  removePlayer(state: State, playerId: string): void;
  input(state: State, playerId: string, input: Input): void;
  tick(state: State, dt: number): void;
}
```

`HostRuntime` owns player admission, the fixed simulation clock, input application, and authoritative snapshot publication. Browser and future dedicated hosts reuse the same runtime and simulation.

The original single-player controller mixed mechanics, Three.js, audio, effects, browser input timing, and render timing. The ownership inversion is complete: deterministic control timing lives in `core/`; map access crosses a numeric `DrivingWorldQuery`; `DrivingVehicleSimulation` exclusively owns plain numeric handling state, collision response, and deterministic time-step updates; visual/audio/effect mutation lives in `PlayerPresentation`; and the browser composes an explicit `LocalDrivingSession`. `PlayerController` is now only a compatibility adapter between detached simulation state and the existing local presentation API. Existing local cameras, modes, and presentation remain unchanged.

The driving conformance path and the public “Drive with friends” composition now use the production replacement: `AuthoritativeDrivingSimulation` creates one extracted production vehicle core per admitted player, maps bounded client control intent, assigns deterministic non-overlapping City Circuit spawns, resolves vehicle collisions authoritatively, and publishes presentation-complete snapshots through `HostRuntime` and `ClientRuntime`. Clients render from a bounded tick-based interpolation buffer with a stable host-tick clock estimate so packet-arrival jitter cannot move render time backward, and a render-only `VehicleView`/fleet owns remote car meshes without simulation authority. The intentionally small pilot schema remains only as a protocol fixture.

### Protocol

The accepted protocol direction is recorded in [`protocol/README.md`](../../../protocol/README.md). GameNet v1 uses CBOR (RFC 8949) as its normative wire format and CDDL (RFC 8610 plus RFC 9682) as its normative schema language.

Each transport message carries one CBOR item with a `[message-type, message-body]` envelope. Fixed structures use arrays; evolving records use integer-keyed maps. Numeric message and field IDs are permanent and never reused.

Protocol-major, capability, and game/ruleset compatibility are separate concerns negotiated through `HELLO` and `WELCOME`. Gameplay packets do not repeat the version after negotiation.

Protocol rule:

```text
client → inputs and intentions
host   → authoritative truth
```

A client never reports a trusted position, collision, score, spawn, or world state. TypeScript codecs implement the published CDDL and registry; they do not become the protocol definition.

## Public API

Individual games consume one session API rather than networking internals.

```ts
const game = new MultiplayerGame(config);

const hosted = await game.host();
console.log(hosted.inviteUrl);

const joined = await game.join(inviteUrl);

joined.sendInput({ throttle: 1, steering: -0.2 });
joined.onState(render);
```

This API is a target, not permission to build a large generic framework. Add methods only when the conformance game needs them.

## Invitations

Direct Invite links are the polished version-one flow:

```text
https://game.example/#invite=<base64url-cbor>
https://game.example/#response=<base64url-cbor>
```

Fragments are not sent to the static server. Invite and response payloads are versioned, self-contained, session- and slot-bound, size-bounded, and one-use. Complete non-trickle SDP includes gathered ICE candidates. A fresh random invite secret proves that the response belongs to that invite; it is a bearer capability, not personal identity.

Optional friend names remain local host UI metadata. Clicking a response link should hand it to the existing same-origin host tab via `BroadcastChannel`, receive acknowledgement, and close the landing tab when the browser permits.

## ICE

ICE configuration is injectable without becoming a separate architecture:

```ts
interface IceProvider {
  getIceServers(): Promise<RTCIceServer[]>;
}
```

Start with a public STUN provider. TURN providers can be added after real connectivity testing demonstrates the need. The WebRTC transport must not know which service supplies ICE servers.

## Topology and lifecycle

Use a star, not a peer mesh:

```text
        host
     / / | \ \
    clients
```

Eight total players require only seven host-side peer connections.

Version-one lifecycle rules:

- Direct Invite links are used only during connection setup;
- each client connects directly to the host;
- the client sends `hello` after channels open;
- the host responds with `welcome` and adds the player;
- clients send sequenced input intent;
- the host ticks the simulation and broadcasts snapshots;
- disconnecting removes that player;
- the host may pause/resume authoritative advancement without accumulating catch-up time;
- losing the host ends the session;
- reconnect and host migration are deferred.

## Project boundary

The kernel should remain small and game-independent:

```text
src/net/
  session.ts
  invite/
    codec.ts
    fragment.ts
    handoff.ts
  transport/
    peer.ts
    webrtc.ts
    ice.ts
  protocol/
    messages.ts
    codec.ts
  runtime/
    host.ts
    client.ts

src/conformance/
  moving-circles/
    simulation.ts
    input.ts
    state.ts
    ui.ts
```

Future files for automatic invite exchange, `transport/websocket.ts`, or a dedicated-server entrypoint are added only when needed. Do not add storage, matchmaking, account, migration, or deployment abstractions in advance.

## Conformance game

The first consumer is moving circles, not the driving game. It is both a demo and the networking conformance suite.

It must prove:

- two browser tabs can complete Direct Invite/Response exchange and exchange data;
- reliable and realtime channels have the intended delivery configuration;
- client inputs are applied only by the host simulation;
- snapshots render all connected circles;
- joins and disconnects do not corrupt the session;
- eight tabs remain usable;
- 20–60 Hz updates work under throttling and packet loss;
- an hour-long session does not leak resources or drift uncontrollably.

This boundary passed automated one-host/seven-client browser conformance and a physical iOS Safari cellular-to-macOS home-network test. The separate driving pilot now reuses the same runtime and Direct Invite ceremony; single-player remains independent.

## Implementation order

1. Prove two-browser WebRTC with raw offer/answer exchange.
2. Add reliable and realtime data channels.
3. Wrap WebRTC behind `PeerConnection`.
4. Implement `HostRuntime` around a presentation-free simulation.
5. Send inputs to the host and snapshots back to clients.
6. Specify GameNet v1 in CDDL and implement bounded CBOR decoding.
7. Build the moving-circles conformance game.
8. Specify and implement the Direct Invite CBOR format.
9. Replace offer/answer textareas with self-contained invite/response links.
10. Add same-origin response handoff to the running host tab.
11. Test eight players and long-running sessions.
12. Investigate TURN fallback from measured failures.
13. Optionally automate exchange of the same Direct Invite envelopes.
14. Much later, reuse `HostRuntime` in a standalone server.

Direct Invite remains the infrastructure-free foundation. Failure or disappearance of any future automatic exchange provider must not affect it.

## Explicit non-goals for version one

- Cloudflare Durable Objects or any dedicated authority;
- databases, durable room state, or player accounts;
- matchmaking or a public room directory;
- P2P mesh networking;
- host migration;
- reconnect/resume semantics;
- Cloudflare Tunnel or other deployment coupling;
- alternate wire encodings or optimization-driven schema machinery before CBOR profiling;
- forcing existing offline modes through multiplayer abstractions.
