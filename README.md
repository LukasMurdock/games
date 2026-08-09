# Lukas Murdock Games

Cloudflare Vite application for games at [games.lukasmurdock.com](https://games.lukasmurdock.com).

## Commands

```sh
pnpm dev
pnpm test
pnpm check
pnpm build
pnpm deploy
```

Local deployment uses the `lukasmurdock` Wrangler authentication profile and the account ID declared in `wrangler.jsonc`.

The driving game is served at `/`, its private drivetrain tuning surface is at `/dyno/`, and Worker APIs live below `/api/`.
