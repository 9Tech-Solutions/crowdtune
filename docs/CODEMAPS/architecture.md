<!-- Generated: 2026-05-10 | Files scanned: 9 | Token estimate: ~600 -->

# Architecture

## Project type

Monorepo. pnpm workspaces for JS side; Go module per backend app.

## High-level layout

```
crowdtune/
├── apps/
│   ├── web/         React 19 + Vite 8 + TS 6 + Tailwind 4 + Zustand 5
│   └── api/         Go 1.25 + Gin + pgx v5 + sqlc + goose
├── infra/
│   └── migrations/  Postgres SQL migrations (goose)
├── docs/
│   ├── pitch/       product deck
│   ├── specs/       prose-only behavioral specs (clean-room translator output)
│   ├── translation-workflow.md  LGPL → SUL clean-room procedure
│   └── CODEMAPS/    this directory
├── .reference/      gitignored Festify clone, reference-only
├── .claude/         agents + rules + crg-generated skills
├── .mcp.json        code-review-graph MCP registration
└── .github/workflows/ci.yml
```

## Boundaries

- **apps/web** never reads .reference/. Communicates with apps/api only via HTTP under /api/* (Vite dev proxy in dev, full-URL in prod).
- **apps/api** never reads .reference/. Owns the OpenAPI contract that apps/web consumes via openapi-typescript codegen.
- **infra/migrations** is the single source of truth for the Postgres schema. apps/api consumes it via sqlc codegen.
- **.reference/festify/** is read-only and accessed only by the festify-translator subagent.

## Data flow (skeleton, expanded as features land)

```
browser
  │  HTTP
  ▼
apps/web (Vite dev :5173)  ──── /api/* proxy ────►  apps/api (Gin :8080)
                                                       │  pgxpool
                                                       ▼
                                                 Postgres on Neon
                                                  (schema from infra/migrations)
```

## Conventions

- React 19 function components, hooks only. No class components, no `forwardRef` (refs are props in 19).
- Zustand store slice per concern, TanStack Query for server state, TanStack Router for routes.
- Tailwind 4 via `@tailwindcss/vite`; one CSS file `src/index.css` with `@import "tailwindcss";`.
- Go layered: cmd/api → internal/handlers → internal/db/sqlc + internal/db/queries.
- Errors wrapped with `fmt.Errorf("context: %w", err)`. No bare `panic` in handlers. slog JSON output.
- One concern per migration; `IDENTITY` not `SERIAL`; `TIMESTAMPTZ` defaults; snake_case identifiers.
