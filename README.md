# Lukas Murdock Games

Cloudflare Vite application for games at [games.lukasmurdock.com](https://games.lukasmurdock.com).

## Commands

```sh
pnpm dev
pnpm test
pnpm test:network-browser
pnpm check
pnpm build
pnpm deploy
```

Local deployment uses the `lukasmurdock` Wrangler authentication profile and the account ID declared in `wrangler.jsonc`.

The homepage at `/` is reserved for the real-time demo introducing the game. The driving game is served at `/drive/`, including separate Direct Invite “Drive with friends” Cruise and Chase modes with host-authoritative pause, pursuit, capture, and synchronized map/mode changes. Legacy root multiplayer and direct-invite links are forwarded to `/drive/`. Its private drivetrain tuning surface is at `/dyno/`, production maneuver sound lab is at `/maneuver-lab/`, and Worker APIs live below `/api/`. Curated source clips, provenance metadata, and spectrogram comparisons live in `audio-references/` and are never included in the client build. Engine synthesis is selected through the data-driven registry in `src/lib/driving-game/audio/engine-types.ts`; the reference-derived turbo I6 remains the production default while additional registrations are explicitly labeled prototypes.

The private WebRTC conformance page is available at `/network-test/`. It creates up to seven self-contained Direct Invite links, hands signed response links to the existing host tab, then runs the eight-player host-authoritative moving-circles game over GameNet v1 without signaling infrastructure. The separate `/network-test/?game=driving` path now uses the extracted production mechanics, City Circuit world queries, authoritative vehicle collisions, and bounded snapshot interpolation without changing the existing single-player game. `pnpm test:network-browser` exercises the full link-only one-host/seven-client flow with an installed Chromium browser; set `GAMENET_BROWSER_PATH` when it is not in a standard location.

The accepted open-protocol direction—CBOR, CDDL, connection-time negotiation, and permanent numeric registries—is documented in [`protocol/README.md`](protocol/README.md).
