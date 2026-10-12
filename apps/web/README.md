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

Route types are generated before checks, tests, and builds. Run `bun run openapi:gen` from the root to regenerate API types after changing `apps/api/openapi.yaml`.
