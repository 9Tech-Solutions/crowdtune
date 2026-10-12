# CrowdTune

Social jukebox for restaurants and bars. Hosts create listening parties, and guests join from their
phones to view the queue and vote on tracks. Built by 9Tech Solutions Co., Ltd.

[![CI](https://github.com/9Tech-Solutions/crowdtune/actions/workflows/ci.yml/badge.svg)](https://github.com/9Tech-Solutions/crowdtune/actions/workflows/ci.yml)

**Status: in development.** The repository includes party creation, queue listing, voting, Neon Auth,
Spotify account connection, and web screens for parties, sharing, settings, search, and TV mode.
Playback control, track search, playlist management, payments, and food ordering are still in development
or planned. This is not a production-ready service.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript 7, TanStack Router + Query, HeroUI 3, Tailwind 4 |
| Web tooling | Bun 1.4, [Vite+](https://viteplus.dev) 1.1 (dev, build, test, lint, format) |
| Backend | Go 1.27, Gin, pgx v5, sqlc, goose migrations |
| Database | PostgreSQL on [Neon](https://neon.tech) |
| Contract | OpenAPI 3.1 (`apps/api/openapi.yaml`) generates Go server stubs and TS client |

## Repo layout

```
crowdtune/
├── .github/                   CI, contribution guide, security policy
├── apps/
│   ├── web/                   React + Vite+ + Tailwind
│   └── api/                   Go + Gin + pgx
├── infra/
│   └── migrations/            goose SQL migrations
├── AGENTS.md                  brief coding-agent instructions
├── .env.example               environment variable template
├── LICENSE.md                 source-available license
├── package.json               Bun workspace and commands
└── bun.lock                   reproducible web dependencies
```

## Getting started

Prerequisites: Bun 1.4.3+, Node 24.21 LTS (Vite+ CLI/tests), Go 1.27.2+, and Git.
Pinned tool versions are in `.tool-versions`. Database-backed features need PostgreSQL and Neon Auth.

```bash
git clone https://github.com/9Tech-Solutions/crowdtune.git
cd crowdtune
bun install --frozen-lockfile
cp .env.example .env
```

Edit `.env` before starting the application:

| Setting | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection used by the API |
| `DATABASE_URL_DIRECT` | Direct PostgreSQL connection used for migrations |
| `NEON_AUTH_JWKS_URL`, `NEON_AUTH_ISSUER`, `NEON_AUTH_AUDIENCE` | API bearer-token validation; use the values for your Neon Auth project |
| `VITE_NEON_AUTH_URL` | Public Neon Auth endpoint used by the web application |
| `VITE_API_URL` | Leave blank in development to use the Vite proxy; deployments can configure an API origin with the appropriate CORS policy |
| `SPOTIFY_*` | Optional Spotify OAuth settings; all four must be configured to enable these endpoints |

Enable Neon Auth in your Neon project before applying migrations: they reference its `neon_auth` schema.
Install the migration tool with `go install github.com/pressly/goose/v3/cmd/goose@latest`, then run this
from the repository root with `DATABASE_URL_DIRECT` exported in your shell:

```bash
goose -dir infra/migrations postgres "$DATABASE_URL_DIRECT" up
```

Run the API in one terminal:

```bash
cd apps/api
go run ./cmd/api
```

Run the web application from the repository root in another terminal:

```bash
bun run dev:web
```

The web development server proxies `/api` to `http://localhost:8080`. Protected API routes are disabled
when `NEON_AUTH_JWKS_URL` is unset. Never put server credentials in `VITE_` variables, which are public
in the browser bundle.

## Checks

From the repository root:

```bash
bun run check:web
bun run test:web
bun run build:web
```

From `apps/api`:

```bash
go vet ./...
go build ./...
go test ./... -race -count=1
```

## Contributing

See the [contribution guide](.github/CONTRIBUTING.md) for architecture conventions, generated files,
and validation commands. See the [security policy](.github/SECURITY.md) for reporting vulnerabilities.

## License

[PolyForm Shield License 1.0.0](./LICENSE.md), offered by 9Tech Solutions Co., Ltd. CrowdTune is
source-available. Use, modification, and redistribution are permitted subject to the license, including
its restriction on providing products that compete with CrowdTune or products the licensor or its
affiliates provide using this software. See the license for the full terms and exceptions.

Required Notice: Copyright 9Tech Solutions Co., Ltd.

Third-party components retain their original licenses. CrowdTune is a trademark of 9Tech Solutions
Co., Ltd.; this license does not grant trademark rights.
