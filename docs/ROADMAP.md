# CrowdTune Roadmap

Living document. Updated each phase. Source of truth for what is shipped, what is in flight, and what is queued.

## Done

| Phase | Title | Outcome |
|---|---|---|
| 0 | Global CLAUDE.md scaffolding rule | "use scaffolding commands, never hand-roll config" enforced for me + subagents |
| 1 | code-review-graph MCP wired | `.mcp.json` via `code-review-graph install --platform claude-code`; 28 MCP tools live |
| 2 | Repo bootstrap | `9Tech-Solutions/crowdtune` initialized, SUL license, pitch under `docs/pitch/` |
| 3 | Subagent dev | 4 project-local agents (festify-translator, react-component-author, gin-handler-author, goose-migration-author) + project rules + clean-room workflow doc |
| 4 | Festify reference clone | `.reference/festify/` populated, gitignore enforced, CI guardrail |
| 5 | Stack scaffolding | Vite/React 19, Go 1.25/Gin, pgx/sqlc/goose, OpenAPI 3.1, GitHub Actions |
| 6 | CRG build + codemaps | 9 files / 18 nodes / 100 edges indexed; 5 codemaps under `docs/CODEMAPS/` |
| 7 | Verification matrix | typecheck / lint / test / build all green; 4 commits pushed to main |
| - | DB smoke test | Neon Postgres reachable; init migration applied (pgcrypto, citext); `/healthz` returns `db: ok` |

---

## Phase 8 - Neon Auth integration (IN PROGRESS)

**Status (2026-05-10):**
- 8a: pending (user task — provision Neon Auth in console; see `docs/setup/neon-auth.md`)
- 8b: done — `@neondatabase/neon-js` + `@neondatabase/auth-ui` installed; NeonAuthProvider wraps the router root; `/sign-in` and `/sign-up` routes render `<AuthView />`
- 8c: done — `apps/web/src/api/client.ts` attaches `Authorization: Bearer <jwt>`; typed `ApiError`
- 8d: done — `internal/auth/{jwks,middleware,middleware_test}.go`; 11 tests pass covering happy path + 8 failure modes
- 8e: done — `/api/me` mounted under bearer-auth `/api` group; OpenAPI updated with `bearerAuth` security scheme; oapi-codegen regenerated
- 8a: **done (user)** — Neon Auth enabled in console, all 5 env vars populated, DB password rotated after a leak in earlier session
- 8f: done — migration renamed `20260510145536_grant_neon_auth_user_read.sql` (Neon Auth's actual schema is straight Better Auth: `user` not `users_sync`); applied 2026-05-10 in 235 ms
- 8h (verification): done — auth middleware confirmed live in process: `/healthz` 200, `/api/me` 401 `missing_bearer` without bearer, 401 `invalid_token` with bogus bearer. Real-JWT end-to-end smoke pending user sign-up via web app.
- 8g: in progress — codemap + project rules updated; CI auth-smoke job deferred (unit tests cover middleware exhaustively, no marginal value in a duplicate integration job until real JWKS exists)



**Goal**: every protected route on the API verifies a Neon Auth (Better-Auth-backed) JWT, the React app has working sign-in / sign-up screens, and our app tables can JOIN against `neon_auth.users_sync`.

### Why Neon Auth (vs Clerk / Auth.js / DIY)

- Same vendor as our Postgres, deployed in the same region as the DB (low latency)
- `neon_auth.users_sync` schema is auto-created and kept current; we never store user PII ourselves
- JWT-based, vendor-agnostic verification flow (works in Go via JWKS - no proprietary SDK on the backend)
- Phased migration story to Better Auth (Stack Auth predecessor is being deprecated; we start on the modern stack)

### Sub-phases (each is a separate commit)

#### 8a. Provision Neon Auth (manual, user task)

User does in Neon Console:
1. Create Neon project (or use existing).
2. Open Auth -> Configuration, click **Enable Neon Auth**.
3. Configure providers: enable Email + Password, Google, and **Spotify** (Spotify OAuth becomes the wedge in Phase 9).
4. Copy `NEON_AUTH_URL` and any cookie/session secrets shown.
5. Copy the JWKS URL (`<NEON_AUTH_URL>/.well-known/jwks.json`) to put in the API env.

I will write a `docs/setup/neon-auth.md` runbook documenting the click-path and env-var capture. No code yet.

#### 8b. Wire env vars

Add to `.env.example`:

```
# --- Neon Auth (Phase 8) ---
NEON_AUTH_URL=https://ep-xxx.neonauth.region.aws.neon.build/neondb/auth
NEON_AUTH_JWKS_URL=https://ep-xxx.neonauth.region.aws.neon.build/neondb/auth/.well-known/jwks.json
NEON_AUTH_ISSUER=https://ep-xxx.neonauth.region.aws.neon.build
NEON_AUTH_AUDIENCE=crowdtune
VITE_NEON_AUTH_URL=$NEON_AUTH_URL
```

The frontend gets `VITE_NEON_AUTH_URL` (Vite-exposed). The API gets the issuer + JWKS URL only - it never sees the user's password or session secret.

#### 8c. Frontend - install Neon Auth UI

Use scaffolding command: `pnpm --filter web add @neondatabase/neon-js @neondatabase/auth-ui`.

New files:
- `apps/web/src/lib/auth-client.ts`: `createAuthClient(import.meta.env.VITE_NEON_AUTH_URL)`
- `apps/web/src/providers/NeonAuthProvider.tsx`: wraps children in `NeonAuthUIProvider` with email-OTP + Google + Spotify enabled
- `apps/web/src/routes/sign-in.tsx`, `sign-up.tsx`: TanStack Router file-based routes that mount `<AuthView />`
- `apps/web/src/main.tsx`: wrap `<App />` in the provider

Adopt TanStack Router's `beforeLoad` guard pattern: protected routes redirect to `/sign-in` when `authClient.getSession()` returns null.

#### 8d. Frontend - attach JWT to API calls

Add `apps/web/src/api/client.ts`: a thin wrapper around `fetch` that pulls `data.session.token` from `authClient.getSession()` and adds `Authorization: Bearer ${token}`. Use it from every TanStack Query hook. No raw `fetch` calls in components - period.

#### 8e. Backend - JWT verification middleware

Use scaffolding: `cd apps/api && go get github.com/golang-jwt/jwt/v5 github.com/MicahParks/keyfunc/v3`.

New files:
- `apps/api/internal/auth/jwks.go`: cached JWKS resolver via `keyfunc.NewDefault([]string{cfg.JWKSURL})`. Refresh interval 1h, short-circuits on signing-key rotation.
- `apps/api/internal/auth/middleware.go`:
  - `RequireUser(jwks keyfunc.Keyfunc) gin.HandlerFunc`: parses `Authorization: Bearer <jwt>`, validates with `jwt.ParseWithClaims` using the JWKS keyfunc, checks `iss` and `aud`, attaches `userID` (sub), `email`, and `role` to `gin.Context` via `c.Set`.
  - Helpers `auth.UserID(c)`, `auth.Email(c)` for handlers.
- `apps/api/internal/auth/middleware_test.go`: table-driven tests with a static JWKS for known good / expired / wrong-issuer / wrong-audience / missing-bearer cases.

Update `apps/api/internal/config/config.go` with `JWKSURL`, `Issuer`, `Audience` env fields.

#### 8f. Backend - apply middleware + add `/me`

Update `cmd/api/main.go` to instantiate the JWKS cache once and reuse. Create a `/api` group that uses `auth.RequireUser`. Add a first protected handler `GET /me` that returns the JWT-extracted user info. Update `openapi.yaml` to declare `securitySchemes: bearerAuth` and apply it to `/me`.

#### 8g. Schema - reference `neon_auth.users_sync`

Migration via scaffolding: `goose -dir infra/migrations create grant_neon_auth_users_sync sql`.

Up SQL:
```sql
-- Allow our application role to read the synced users table.
GRANT USAGE ON SCHEMA neon_auth TO <APP_ROLE>;
GRANT SELECT ON neon_auth.users_sync TO <APP_ROLE>;
```

Down SQL: revoke. The migration is idempotent and runs after Neon Auth has been enabled (which creates the `neon_auth` schema). If the schema does not yet exist, the migration fails fast - that is correct (stops you running the API against an unprepared DB).

App tables that own user-scoped rows reference users by `user_id TEXT` (the `sub` claim) with a `FOREIGN KEY (user_id) REFERENCES neon_auth.users_sync(id)` if Neon Auth's `users_sync` schema permits it; otherwise we keep the FK soft and rely on the app boundary.

#### 8h. CI updates

`.github/workflows/ci.yml`:
- Add a job that boots the API with a stub JWKS (using `httptest`) and curls `/me` with a self-signed token to confirm the middleware is wired.
- The Neon Auth provisioning step is manual; CI uses a fixture, not a real auth provider.

#### 8i. Update docs

- `docs/CODEMAPS/dependencies.md`: flip Neon Auth from "future" to "live".
- `docs/CODEMAPS/backend.md`: add `/me` route, document middleware chain.
- `.claude/rules/project.md`: add "Auth conventions" section pointing at the JWT contract and `auth.UserID(c)` helper.
- `apps/web/src/api/client.ts` referenced from `docs/CODEMAPS/frontend.md`.
- `apps/api/README.md`: add Neon Auth setup step in the local-dev runbook.
- `README.md` Getting Started section gains "Configure Neon Auth" step.

### Files we'll touch

| File | Action |
|---|---|
| `.env.example` | add 4 env vars |
| `apps/web/package.json` | `pnpm add @neondatabase/neon-js @neondatabase/auth-ui` |
| `apps/web/src/lib/auth-client.ts` | new |
| `apps/web/src/providers/NeonAuthProvider.tsx` | new |
| `apps/web/src/routes/__root.tsx`, `sign-in.tsx`, `sign-up.tsx` | new (introduces TanStack Router file-based routing) |
| `apps/web/src/api/client.ts` | new |
| `apps/web/src/main.tsx` | wrap with provider + RouterProvider |
| `apps/api/go.mod` | `go get golang-jwt/jwt/v5 + MicahParks/keyfunc/v3` |
| `apps/api/internal/auth/{jwks,middleware,middleware_test}.go` | new |
| `apps/api/internal/config/config.go` | add JWKSURL/Issuer/Audience |
| `apps/api/cmd/api/main.go` | wire JWKS cache + `/api` group |
| `apps/api/openapi.yaml` | add `securitySchemes.bearerAuth`, `/me` op |
| `apps/api/internal/handlers/me.go` | new |
| `infra/migrations/<ts>_grant_neon_auth_users_sync.sql` | new |
| `docs/setup/neon-auth.md` | new runbook |
| `docs/CODEMAPS/{dependencies,backend,frontend}.md` | revise |
| `.claude/rules/project.md` | add auth section |
| `.github/workflows/ci.yml` | add api-auth-smoke job |

### Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Neon Auth still in beta in some regions | MEDIUM | Verify GA in your Neon project's region before committing 8a; if not GA, fall back to provisioning Better Auth ourselves on the API side and skipping Neon Auth UI |
| 2 | `@neondatabase/neon-js` and `@neondatabase/auth-ui` are young packages with thin TanStack Router examples | MEDIUM | Spike on a one-component sign-in screen in 8c; if API changes mid-phase, pin minor version and document |
| 3 | JWKS cache staleness on key rotation could cause 401 storms | LOW | `keyfunc/v3` auto-refreshes on signature failure |
| 4 | `neon_auth.users_sync` schema may be read-only and reject FK references | LOW | Detect in 8g; fall back to soft FK if hard FK is rejected |
| 5 | Spotify OAuth via Neon Auth may not be available out of the box; Phase 9 may need a custom provider | MEDIUM | Confirm in 8a; if no Spotify provider, Phase 9 wires Spotify OAuth ourselves and links to Neon Auth user |
| 6 | Stack Auth deprecation could break flows mid-build | LOW | We are starting on Better Auth from day 1 - no Stack Auth code path to deprecate |

### Decisions locked

- **Auth providers (8a)**: Email + Password + Google + Spotify. (Spotify is the wedge for Phase 9.)
- **Token transport**: `Authorization: Bearer <jwt>` for API calls. No HTTP-only cookies on the API. Cookies are Neon Auth's frontend session storage only.
- **Backend libs**: `golang-jwt/jwt/v5` + `MicahParks/keyfunc/v3` (idiomatic, no CGO, MIT-licensed).
- **User identity**: `sub` claim is the canonical user ID throughout our schema. We never duplicate Neon's user table.
- **Authorization style**: route-level middleware first; row-level security via Postgres RLS deferred until we have multi-tenant data.

### Estimated complexity: MEDIUM
~5 hours focused work, plus the manual 15-min Neon Auth provisioning in 8a.

---

## Phase 9 - Spotify OAuth + playback bridge (planned, brief)

After auth: the host (venue staff) connects a Spotify Premium account. The Web Playback SDK becomes the music engine. Customers do not need Spotify accounts.

Touch points:
- Stack the Spotify OAuth on top of Neon Auth (or directly via Spotify's OAuth if Neon Auth's Spotify provider is too thin)
- Store encrypted refresh tokens server-side; never expose them to the browser
- New table: `parties (id, host_user_id, spotify_refresh_token_encrypted, ...)`
- New endpoints: `POST /parties` (create), `POST /parties/{id}/connect-spotify`, `GET /parties/{id}/now-playing`

Translator workflow applies: read `.reference/festify/functions/spotify/*` -> spec only -> implement in Go.

## Phase 10 - Voting + queue (planned, brief)

Customers join a party by short code (no account beyond optional anonymous Neon Auth session), search Spotify catalog through our backend (rate-limited), upvote tracks, watch queue reorder live (server-sent events or websockets).

Festify-equivalent functions to translate:
- party-code generation
- queue ordering + tie-break by request time
- vote dedup per user per track
- fallback playlist when queue empty

## Phase 11 - Pay per track (planned, brief)

10 / 20 THB tiers from the pitch. Wedge: PromptPay QR (Thai market) and Stripe TH for cards. Adds: payments table, idempotency keys, queue priority bump on paid tracks (TouchTunes "Fast Pass" pattern, dynamically priced as queue grows).

## Phase 12 - Food ordering surface (planned, brief)

Menu CRUD, table-side ordering, basket, hand-off to a POS or order-printer. POS integration is open: research phase before scoping.

## Phase 13 - Operator dashboard (planned, brief)

Venue staff console. Live queue, active customers, daily revenue (music + food), pause/skip/ban controls. Lives at `apps/web/src/routes/operator/*` behind a separate role claim.

## Phase 14 - Production deploy (planned, brief)

Web on Vercel or Cloudflare Pages. API on Fly.io or Render in the same region as Neon. Domain + SSL + Sentry + status page. CI promotes main to staging automatically; production deploy gated on a manual GitHub Actions approval.

---

## Format

When a phase begins, fork its detailed sub-section into `docs/phases/phase-N.md` for execution. The roadmap stays high-level. Update the **Done** table at the top of this file when each phase ships.
