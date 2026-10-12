# CrowdTune web

React 19, TanStack Router and Query, HeroUI 3, and Tailwind 4. Bun manages the workspace; Vite+ runs development, builds, linting, formatting, and tests.

Run from the repository root:

```sh
bun install --frozen-lockfile
bun run dev:web
bun run check:web
bun run test:web
bun run build:web
```

`apps/web/vite.config.ts` holds the web tooling configuration. Checks include formatting, linting, and types. Tests use Vite+ with jsdom and Testing Library.

The development server proxies `/api` to the Go API on port 8080. See the [root README](../../README.md) for environment setup and service configuration.

Route types are generated before checks, tests, and builds. API requests use the shared client and
entity models; update them alongside `apps/api/openapi.yaml` when changing the contract.

The web app uses Feature-Sliced Design. `shared/api` contains the technical SDK clients; `entities/track`
owns track identity, link parsing, metadata, and queue adapters. `features/connect-music` owns Spotify
authorization and `features/music-playback` owns host playback transitions. `widgets/music-player` and
`widgets/party-track-search` compose those pieces; pages coordinate them and routes stay thin. Shared
party/playback queries live in `entities/party`, so TV and party pages do not import each other.
