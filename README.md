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

The driving game is served at `/`, its private drivetrain tuning surface is at `/dyno/`, and Worker APIs live below `/api/`.

The private WebRTC conformance page is available at `/network-test/`. It creates up to seven self-contained Direct Invite links, hands signed response links to the existing host tab, then runs the eight-player host-authoritative moving-circles game over GameNet v1 without signaling infrastructure. `pnpm test:network-browser` exercises the full link-only one-host/seven-client flow with an installed Chromium browser; set `GAMENET_BROWSER_PATH` when it is not in a standard location.

The accepted open-protocol direction—CBOR, CDDL, connection-time negotiation, and permanent numeric registries—is documented in [`protocol/README.md`](protocol/README.md).
