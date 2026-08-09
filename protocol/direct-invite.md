# GameNet Direct Invite v1

Status: **normative v1 draft with TypeScript implementation and conformance fixtures**.

Direct Invite is the foundational GameNet connection ceremony for private games. It removes the signaling service by making the player's existing messaging app carry two opaque, self-contained links:

```text
host ── invite link ──► friend
host ◄─ response link ─ friend
host ═════ WebRTC ═════ friend
```

Discord, Signal, iMessage, WhatsApp, Slack, email, and similar tools are the exchange mechanism. GameNet does not recreate accounts, social graphs, lobbies, matchmaking, or rendezvous infrastructure.

Direct Invite removes a signaling server. It does **not** remove ICE infrastructure: STUN is normally still needed, and some network pairs require TURN before a direct gameplay connection can be established.

## One invite, one peer connection

Each invite creates exactly one host-side slot and exactly one `RTCPeerConnection`:

```text
                 host session
              ┌──────┼──────┐
           slot 1  slot 2  slot 3
           Jamie    Sam      Lee
```

Creating or consuming a slot never restarts the host simulation or another peer connection. A slot is one-use. A response is valid only for the session and slot that produced its invite.

An optional name such as “Jamie” is host-local UI metadata. It is not transmitted, trusted as player identity, or included in the protocol payload.

## URL transport

The same static game URL carries either payload in its fragment:

```text
https://game.example/#invite=<base64url-cbor>
https://game.example/#response=<base64url-cbor>
```

Fragments are not included in HTTP requests, so the static server receives neither payload. Encoding is unpadded base64url over one complete CBOR item. Decoders reject invalid base64url, trailing CBOR data, tags, indefinite values, duplicate keys, oversized fields, and unknown envelope types.

Fragments reduce server exposure; they are not secret storage. Links still exist in messaging history, clipboard history, browser history, screenshots, extensions, and recipient devices. Anyone holding an unused invite is a bearer capable of answering that slot.

## CBOR envelopes

Direct Invite has its own format version, independent from the negotiated GameNet gameplay major.

Diagnostic notation:

```text
; invite
[0, {
  0: 1,                    ; Direct Invite format version
  1: h'...',               ; 128-bit random session ID
  2: 3,                    ; uint32 peer slot
  3: "v=0...",            ; complete offer SDP, including gathered ICE candidates
  4: h'...',               ; 256-bit random invite secret
  ? 5: 1735689600          ; optional expiry, Unix seconds
}]

; response
[1, {
  0: 1,
  1: h'...',               ; same session ID
  2: 3,                    ; same peer slot
  3: "v=0...",            ; complete answer SDP, including gathered ICE candidates
  4: h'...'                ; 256-bit response proof
}]
```

The v1 implementation uses non-trickle ICE: it waits for gathering to complete, then serializes the complete SDP. Candidates are therefore already represented by SDP `a=candidate` lines and are not duplicated as a second field. A future format may add an optional explicit candidate field without changing existing IDs.

The normative schema is [`direct-invite-v1.cddl`](direct-invite-v1.cddl), with permanent assignments in [`direct-invite-registry.md`](direct-invite-registry.md). In summary:

```cddl
direct-message = direct-invite / direct-response

direct-invite = [0, {
  0 => 1,
  1 => session-id,
  2 => peer-slot,
  3 => offer-sdp,
  4 => invite-secret,
  ? 5 => unix-seconds,
  * extension-key => any
}]

direct-response = [1, {
  0 => 1,
  1 => session-id,
  2 => peer-slot,
  3 => answer-sdp,
  4 => response-proof,
  * extension-key => any
}]

session-id = bstr .size 16
peer-slot = 0..4294967295
offer-sdp = tstr .size (1..32768)
answer-sdp = tstr .size (1..32768)
invite-secret = bstr .size 32
response-proof = bstr .size 32
unix-seconds = 0..9007199254740991
extension-key = 0..65535
```

Field numbers are permanent under the same registry rules as GameNet. Removed fields become reserved and are never reused.

V1 decode limits are a 48 KiB encoded payload, depth 8, 32 entries per map, 32 items per array, 32 KiB per text or byte string, and unsigned 16-bit map keys. Field-specific CDDL bounds remain tighter where stated. Unknown fields are fully validated against these limits before being ignored.

## Response proof

The proof binds an answer to possession of the invite and prevents accidental or malicious cross-slot response application. It does not establish a person's identity; the invite remains a bearer capability.

```text
proof = HMAC-SHA-256(
  key = inviteSecret,
  data = UTF8("GameNet DirectResponse v1\0")
         || deterministic-CBOR([sessionId, peerSlot, answerSdp])
)
```

The response tuple uses RFC 8949 deterministic encoding. Implementations compare proofs without data-dependent early exit.

The host validates format version, session ID, slot ID, expiry, unused status, answer type, SDP bounds, and proof before calling `setRemoteDescription`. It then marks the slot consumed. Replayed, expired, wrong-session, wrong-slot, and invalid-proof responses fail closed without affecting other slots.

The secret and raw SDP must not be logged. Session IDs and slot IDs are locators, not authentication by themselves.

## Browser flow

### Host

1. Start or retain one authoritative host session.
2. Create a named or unnamed slot.
3. Generate a random session ID once per host session.
4. Generate a fresh 256-bit secret for the slot.
5. Create one `WebRTCPeerConnection` and gather its offer completely.
6. Encode and display the invite link.
7. Mark the slot “waiting for response.”

### Friend

1. Open the invite link.
2. Decode and validate the fragment locally.
3. Create one client `WebRTCPeerConnection` and apply the offer.
4. Gather the answer completely.
5. Compute the response proof.
6. Encode and display the response link.
7. Send the response through the same social channel.

### Response handoff

When the host clicks a response link, the landing tab should deliver it to the already-running same-origin game tab using `BroadcastChannel`:

```text
channel: gamenet-direct-v1:<base64url-session-id>
new tab → validated response payload
host tab → acknowledgement
new tab → window.close()
```

The host tab remains the sole owner of slot state and performs all validation. The landing tab never applies an answer itself. If no matching host tab acknowledges, the page keeps the response visible with a copy button and an explanation rather than discarding it. Browsers may refuse script-initiated close; in that case the page reports successful handoff and asks the user to close it.

## Architectural boundary

Version one has three primary seams:

```text
DirectInviteCodec
       ↓
WebRTCPeerConnection
       ↓
HostRuntime / ClientRuntime
       ↓
GameSimulation
```

`DirectInviteCodec` handles only invitation and response serialization, proof generation/verification, bounds, and fragment conversion. It does not own gameplay messages or WebRTC.

No `Signaler` is required for the first real version. Future automatic rendezvous is an optional convenience layer that exchanges the exact same Direct Invite envelopes. Removing that provider must leave direct links fully functional.

## TypeScript implementation

`src/net/invite/` implements the bounded CBOR codec, canonical base64url fragments, random capability generation, deterministic HMAC proof, verification, and race-safe one-use host slot state. Decode failures are structured results rather than unchecked exceptions.

A synthetic 4,096-byte SDP produces a 5,555-character invite fragment and a 5,576-character URL at `https://game.example/`. A response of the same SDP size is two characters longer because `response` is longer than `invite`. Real gathered SDP sizes and behavior across messaging apps still need measurement before the 32 KiB SDP limit is frozen.

## Browser implementation

The conformance page now uses link-only setup: host-local optional names, one invite per peer slot, automatic invite landing, signed response generation, session-specific `BroadcastChannel` handoff, acknowledgement, and safe fallback when no host tab responds. Sensitive fragments are decoded into memory and immediately removed from the visible URL/history entry.

The eight-browser test uses Direct Invite/Response links exclusively, verifies remote authoritative movement, rejects response replay, isolates client departure, and confirms host shutdown propagation.

## Field validation

A production Direct Invite session successfully connected iOS Safari on cellular with macOS on a separate home network using the STUN-only configuration. This validates the complete messaging-link ceremony, same-origin response handoff, mobile WebRTC support, and a real cross-network path without TURN. It is one successful topology, not a general NAT success-rate measurement.

## Next validation milestone

1. Measure gathered invite sizes across browsers and networks.
2. Exercise links through common messaging applications before freezing v1 limits.
3. Test STUN-only success rates across representative NAT combinations.
4. Add an injectable TURN provider only from measured connectivity failures.
