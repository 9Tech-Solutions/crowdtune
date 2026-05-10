# CrowdTune Project Rules

These rules layer on top of the global ECC rules at `~/.claude/rules/common/`. When they conflict, the
project rule wins.

## Stack lock

- **Frontend**: React 19, Vite 5, TypeScript 5.7, Zustand 5, TanStack Router + Query, Tailwind 4, Vitest.
- **Backend**: Go 1.25, Gin, pgx v5, sqlc, goose migrations, slog.
- **DB**: Postgres on Neon.
- **Contract**: OpenAPI 3.1 in `apps/api/openapi.yaml`, codegen for both server stubs (`oapi-codegen`) and TS
  client types (`openapi-typescript`).
- **AI tooling**: code-review-graph MCP for context-efficient review.

Do not propose alternate frameworks (Next.js, Echo, Fiber, Drizzle, sqlx, etc.) without explicit user approval.

## Use scaffolding commands

Mirrors the global rule: never hand-write `package.json`, `go.mod`, migration files, or framework boilerplate
when a CLI exists. Run the official command first, edit only the gaps. Subagents inherit this rule via their
system prompts.

## Clean-room translation

Code under `apps/web/` and `apps/api/` is licensed under the Sustainable Use License. Festify
(`.reference/festify/`) is LGPLv3. The two-agent translator firewall in `docs/translation-workflow.md` is the
only sanctioned path from Festify behavior to our code. Implementer agents are forbidden from reading
`.reference/`.

## Push target

`main` on `https://github.com/9Tech-Solutions/crowdtune` is the source of truth. Direct pushes to main are
acceptable for solo work; use feature branches once a second contributor joins. Never push to a fork or
secondary remote.

## Code review graph first

Every code search starts with the code-review-graph MCP tools (`semantic_search_nodes`, `query_graph`,
`get_review_context`, `get_impact_radius`) before falling back to Grep / Glob / Read. The graph is faster
and the review hooks expect it as the primary index.

## Reviewer routing

- `*.tsx`, `*.ts` -> ECC `typescript-reviewer` agent or `/code-review`
- `*.go` -> ECC `go-reviewer` agent or `/go-review`
- Anything touching auth, payment, secrets, SQL, file paths, external APIs -> ECC `security-reviewer` agent
  or `/security-review`
- Architectural decisions or new modules -> ECC `architect` agent

## Commit hygiene

- Conventional commits: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`.
- One concern per commit. No "fix typo + add feature + tweak CI" combos.
- Commit messages explain *why* in the body when the diff alone does not.
- Use `/prp-commit` for natural-language file targeting; use `/prp-pr` when opening PRs.

## Never commit

- Real secrets (.env, service-account.json, Firebase admin SDK files).
- Festify source under `.reference/`.
- Generated files except where explicitly tracked (lockfiles).
- Pitch deck revisions without bumping version in filename (current: `docs/pitch/CrowdTune.pptx`).
