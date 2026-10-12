# CrowdTune

Social jukebox for restaurants and bars. Hosts create listening parties, and guests join from their
phones to view the queue and vote on tracks. Built by 9Tech Solutions Co., Ltd.

[![CI](https://github.com/9Tech-Solutions/crowdtune/actions/workflows/ci.yml/badge.svg)](https://github.com/9Tech-Solutions/crowdtune/actions/workflows/ci.yml)

**Status: in development.** The repository includes party creation, queue listing, voting, Neon Auth,
Spotify account connection, mixed-provider queues, catalog search, host playback controls, and web
screens for parties, sharing, settings, search, and TV mode. Provider playback uses Spotify's Web
Playback SDK, Apple MusicKit JS, and the visible YouTube IFrame player. Playlist management, payments,
and food ordering are still in development or planned. This is not a production-ready service.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript 7, TanStack Router + Query, HeroUI 3, Tailwind 4 |
| Web tooling | Bun 1.4, [Vite+](https://viteplus.dev) 1.1 (dev, build, test, lint, format) |
| Backend | Go 1.27, Gin, pgx v5, sqlc, goose migrations |
| Database | PostgreSQL on [Neon](https://neon.tech) |
| Contract | OpenAPI 3.1 (`apps/api/openapi.yaml`) generates Go server stubs; web requests use the shared API client and entity models |

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
| `APPLE_MUSIC_DEVELOPER_TOKEN`, `APPLE_MUSIC_STOREFRONT` | Apple Music developer token and catalog storefront (`us` by default) |
| `YOUTUBE_API_KEY` | Optional server-only YouTube Data API v3 key for catalog search and metadata |

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

## Music services

One queue can contain Spotify, Apple Music, and YouTube tracks. Guests choose a service in the search
screen or paste a track link. Spotify track URLs/URIs, Apple Music song links (including album links
with a song's `i` parameter), YouTube video links, and YouTube Music video links are accepted.

The host starts playback from the party's host player. Connect Spotify there; the registered redirect
URI must point to `/spotify/callback` on the web application. Spotify playback requires Premium and the
OAuth streaming/playback permissions requested by CrowdTune. Apple Music authorizes the host through
MusicKit and requires a subscription and a configured developer token.

For local Spotify authorization, open `http://127.0.0.1:5173` and register
`http://127.0.0.1:5173/spotify/callback` in your Spotify app. The redirect must use the same web origin
so authorization state remains available in that tab. Spotify does not accept `localhost` redirects;
production redirects must use HTTPS. Configure Neon Auth for the same web origin.

YouTube video links can play without an API key. Search and metadata need a YouTube Data API v3 key.
YouTube Music links use the visible YouTube player; native YouTube Music account/library access is
not implemented. Video playback pauses when the host tab is hidden. Spotify and Apple Music catalog
search need their respective credentials. If catalog metadata is unavailable, track links retain their
provider and ID and can still be queued.

Only the host can play, pause, skip, or remove tracks. A database-backed player lease prevents two
host tabs from controlling playback concurrently. Stop playback on the current device before moving
to another tab. The previous service stops before the next track's service starts.

Provider SDKs and subscriptions have their own terms. In particular, the
[Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk) requires
Spotify's prior written approval for commercial projects; CrowdTune's software license does not grant
that approval or public-performance rights.

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
