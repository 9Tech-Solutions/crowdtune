# CrowdTune Project Rules

These rules layer on top of the global ECC rules at `~/.claude/rules/common/`. When they conflict, the
project rule wins.

## Stack lock

- **Frontend**: React 19, Vite 8, TypeScript 6, Zustand 5, TanStack Router + Query, Tailwind 4, **HeroUI v3**, Vitest 4.
- **Frontend architecture**: **Feature-Sliced Design (FSD)** - `src/{app, pages, widgets, features, entities, shared}` with imports flowing strictly downward. `src/routes/` is an FSD exception (TanStack file-based routing); each route file is a thin import from `@/pages/<name>`.
- **Backend**: Go 1.25, Gin, pgx v5, sqlc, goose migrations, slog.
- **DB**: Postgres on Neon.
- **Auth**: Neon Auth (Better-Auth-backed); `@neondatabase/neon-js/auth/react` + `/auth/react/ui` + `/ui/css`.
- **Contract**: OpenAPI 3.1 in `apps/api/openapi.yaml`, codegen for both server stubs (`oapi-codegen`) and TS
  client types (`openapi-typescript`).
- **AI tooling**: code-review-graph MCP for context-efficient review; HeroUI agent skill + MCP server for component lookups.

Do not propose alternate frameworks (Next.js, Echo, Fiber, Drizzle, sqlx, Redux, Stack Auth, etc.) without explicit user approval.

## FSD layer rules

- **Imports flow down only**: `app -> pages -> widgets -> features -> entities -> shared`. A layer never imports from a higher layer.
- **Path aliases**: `@/app`, `@/pages`, `@/widgets`, `@/features`, `@/entities`, `@/shared`. Configured in both `tsconfig.app.json` (relative paths, no `baseUrl`) and `vite.config.ts` (resolve.alias via `fileURLToPath`).
- **Public API per slice**: each slice has an `index.ts` barrel that exports its public surface. Consumers import from the slice barrel (`@/pages/home`), not deep paths (`@/pages/home/ui/HomePage`).
- **`src/routes/` exception**: TanStack Router file-based routing requires routes in `src/routes/`. Each route file is a thin wrapper that imports a page component from `@/pages/<name>` and binds it via `createFileRoute`. No business logic in route files.

## HeroUI v3 conventions

- **No `<HeroUIProvider>`** - v3 is CSS-themed. The single `@import "@heroui/styles"` in `src/app/styles/index.css` pulls in Tailwind 4, base, components, theme, utilities, variants.
- **Dark mode**: `<html class="dark">` in `index.html`. HeroUI components pick this up automatically.
- **Component API**: `Card.Content` (or `CardContent`), not `CardBody`. Button `variant` covers visual style (primary | danger | danger-soft | ghost | outline | secondary | tertiary); no separate `color` prop, no `solid` variant.
- **Anchor-as-button**: `<a className={buttonVariants({ variant, size })}>` for navigation CTAs. Button does not accept `href`/`as`.
- **Component lookups**: prefer the project-scoped `heroui-react` skill at `.claude/skills/heroui-react/` and the `heroui-react` MCP server (registered in `.mcp.json`) over guessing from training data.

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

## Auth conventions (Phase 8 onwards)

- **JWT is the canonical session.** No cookies on the API. Frontend uses `apps/web/src/lib/auth-client.ts` (Neon Auth / Better Auth); backend validates via `internal/auth.RequireUser`.
- **Never call `fetch` from a React component.** Always go through `apps/web/src/api/client.ts`'s `api()` wrapper so the bearer is attached and `ApiError` lands consistently.
- **`sub` is the user ID, everywhere.** Persist `user_id TEXT` columns referencing the JWT `sub` claim. Never duplicate Neon's user table; JOIN against `neon_auth."user"` (the Better-Auth-provisioned user table; `user` is a reserved word and must be quoted).
- **No JWT validation outside `internal/auth`.** Handlers call `auth.UserID(c)` / `auth.Email(c)` / `auth.Role(c)` to read claims from `gin.Context`. Direct token parsing in handlers is forbidden.
- **Add new protected routes to the `/api` group.** `cmd/api/main.go` mounts the auth middleware once at the group level; never re-attach `RequireUser` per-route.
- **Update `openapi.yaml` with `security: [bearerAuth: []]` for any new authed endpoint.** Public endpoints set `security: []` explicitly to opt out.
- **Sensitive endpoints get `/security-review` before merge.** Anything touching auth, payments, secrets, file paths, or external APIs must run the ECC `security-reviewer` agent or `/security-review` first.

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

## Never transcribe secrets (extends global rule)

- Never `cat`/`Read`/`grep`/`diff` the contents of `.env`, `.env.*`, `*.pem`, or any `*-key.json` into chat.
  Use length-only probes when checking presence: `v=$(grep '^KEY=' .env | cut -d= -f2-); printf 'KEY=SET (len=%d)\n' "${#v}"`.
- Pipe goose / API / curl output through a redactor sed when it might surface a `postgres://` URL, a Neon
  hostname, or a JWT. The canonical sed:
  `sed -E 's|postgres(ql)?://[^[:space:]"\]+|<DB_URL_REDACTED>|g; s|https://[a-z0-9-]+\.neon(auth)?\.[^[:space:]"\]+|<NEON_URL_REDACTED>|g; s|eyJ[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+\.[A-Za-z0-9_=-]+|<JWT_REDACTED>|g'`.
- The API logs `issuer_set` / `audience_set` booleans, not values. Keep it that way; do not regress.
- If a secret leaks into chat, immediately tell the user to rotate. Do not try to retract or hide it.
