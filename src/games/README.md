# Game ownership

Each game is a vertical slice under `src/games/<game>/` and owns its runtime, mechanics, presentation, multiplayer adapter, labs, styles, tests, and game-specific documentation. Route HTML files remain small shells at their deployed URL so Vite preserves stable paths.

Shared networking stays in `src/net/`. Networking conformance fixtures stay in `src/conformance/`. Site-owned marketing experiences stay in `src/site/` and may consume a game's explicit public facade or narrowly scoped production modules.

Do not introduce a generic game framework before another game demonstrates a concrete shared requirement. Promote code out of a game only when at least two real consumers need the same contract.
