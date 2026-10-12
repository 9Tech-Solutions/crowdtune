# CrowdTune

Social jukebox for restaurants and bars. Customers vote and pay to queue songs from their phones,
integrated with food ordering and payments. Built by 9Tech Solutions Co., Ltd.

> **Status: in development.** See [translation progress](docs/translation-progress.md).
> The [clean-room workflow](docs/translation-workflow.md) uses the LGPL-licensed Festify reference
> locally under `.reference/festify/`; reference source is never committed.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript 7, TanStack Router + Query, HeroUI 3, Tailwind 4 |
| Web tooling | Bun 1.4, [Vite+](https://viteplus.dev) 1.1 (dev, build, test, lint, format) |
| Backend | Go 1.27, Gin, pgx v5, sqlc, goose migrations |
| Database | PostgreSQL on [Neon](https://neon.tech) |
| Contract | OpenAPI 3.1 (`apps/api/openapi.yaml`) generates Go server stubs and TS client |
| AI tooling | [code-review-graph](https://github.com/tirth8205/code-review-graph) MCP for context-efficient code review |

## Repo layout

```
crowdtune/
├── .claude/                   AI agents, rules, hooks, generated skills
├── .mcp.json                  code-review-graph MCP registration
├── .reference/                (gitignored) read-only Festify clone for translator agent
├── apps/
│   ├── web/                   React + Vite+ + Tailwind
│   └── api/                   Go + Gin + pgx
├── infra/
│   └── migrations/            goose SQL migrations
├── docs/
│   ├── pitch/                 product deck
│   ├── specs/                 prose-only behavioral specs (translator output)
│   └── CODEMAPS/              architecture maps
├── AGENTS.md                  canonical working instructions
├── package.json               Bun workspace and commands
└── bun.lock                   reproducible web dependencies
```

## Getting started

Prerequisites: Bun 1.4.3+, Node 24.11+ (Vite+ CLI/tests), Go 1.27.2+, and Git.
Pinned tool versions are in `.tool-versions`. Python and
[code-review-graph](https://github.com/tirth8205/code-review-graph) are optional review tooling.

```bash
# Install everything
bun install --frozen-lockfile

# Run frontend dev server
bun run dev:web

# Check types, lint, and formatting; test and build
bun run check:web
bun run test:web
bun run build:web

# Run backend with live reload
cd apps/api && go run ./cmd/api

# Database migrations against Neon (from the repo root)
# Install goose and set DATABASE_URL_DIRECT first.
goose -dir infra/migrations postgres "$DATABASE_URL_DIRECT" up
```

## License

[Sustainable Use License v1.0](./LICENSE.md). Free for personal, internal-business, and non-commercial use.
Hosting CrowdTune as a paid service requires a separate commercial agreement with 9Tech Solutions.
