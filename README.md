# CrowdTune

Social jukebox for restaurants and bars. Customers vote and pay to queue songs from their phones,
integrated with food ordering and payments. Built by 9Tech Solutions Co., Ltd.

> **Status: Phase 0 - skeleton.** No business logic yet. The repo is being built up via clean-room
> translation from the LGPL-licensed Festify reference (kept locally under `.reference/festify/`,
> never committed). See `docs/translation-workflow.md` once Phase 5 lands.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 5, TypeScript 5.7, Zustand 5, TanStack Router + Query, Tailwind 4 |
| Backend | Go 1.25, Gin, pgx v5, sqlc, goose migrations |
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
│   ├── web/                   React + Vite + Tailwind
│   └── api/                   Go + Gin + pgx
├── infra/
│   └── migrations/            goose SQL migrations
├── docs/
│   ├── pitch/                 product deck
│   ├── specs/                 prose-only behavioral specs (translator output)
│   └── CODEMAPS/              architecture maps
└── pnpm-workspace.yaml
```

## Getting started

Prerequisites: Node 22+, pnpm 10+, Go 1.25+, Python 3.10+, Git, [code-review-graph](https://github.com/tirth8205/code-review-graph).

```bash
# Install everything
pnpm install

# Build the code-review-graph (run once; auto-updates after)
code-review-graph build

# Run frontend dev server
pnpm --filter web dev

# Run backend with live reload
cd apps/api && air

# Database migrations against Neon (set DATABASE_URL first)
goose -dir infra/migrations postgres "$DATABASE_URL" up
```

## License

[Sustainable Use License v1.0](./LICENSE.md). Free for personal, internal-business, and non-commercial use.
Hosting CrowdTune as a paid service requires a separate commercial agreement with 9Tech Solutions.
