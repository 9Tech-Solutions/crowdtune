<!-- Generated: 2026-05-11 | Files scanned: 18 | Token estimate: ~900 -->

# Backend (apps/api)

## Routes (current)

| Method | Path | Auth | Handler | Description |
|---|---|---|---|---|
| GET | /healthz | public | handlers.metaHandler.health | Liveness + DB ping |
| GET | /api/me | bearer JWT | handlers.me | Echo JWT-extracted user_id, email, role |
| POST | /api/spotify/token | bearer JWT | handlers.spotifyHandler.exchangeToken | Exchange Spotify OAuth code for tokens; encrypts refresh token before DB write |

The OpenAPI contract lives at `apps/api/openapi.yaml`. Run `make openapi` to regenerate `internal/oapi/server.gen.go`. `bearerAuth` is declared as a `securitySchemes` entry; `/healthz` opts out with `security: []`.

## Layered structure

```
cmd/api/main.go         wire-up: config -> pgxpool -> gin -> handlers -> http.Server with graceful shutdown
  │
  ▼
internal/config         caarlos0/env-driven Config struct (DB URL, host/port, JWKS URL, issuer, audience, 4x Spotify env vars)
internal/auth           JWKS resolver (keyfunc) + RequireUser gin middleware; UserID/Email/Role helpers
internal/handlers       one file per resource: meta.go (public), me.go (protected), spotify.go (protected, Phase 9b.2)
internal/spotify        Spotify OAuth HTTP client (Phase 9b.2): Client, ExchangeCode, RefreshAccessToken; 1-retry-on-5xx with 500ms pause; sentinel errors
internal/tokencrypto    AES-256-GCM helpers (Phase 9b.1): Encrypt, Decrypt, KeyFromHex; fresh 12-byte nonce per write
internal/db/queries     .sql files for sqlc (Phase 9b.2: spotify_credentials.sql with Upsert / Get / Delete)
internal/db/sqlc        sqlc-generated, COMMITTED (policy change in 86ec609 - see project memory)
internal/oapi           oapi-codegen output, gitignored
internal/domain         pure types (no I/O), reserved for future
```

## Middleware chain

```
gin.New()
  └── gin.Recovery()                       panic catch
  └── requestLogger(slog)                  method, path, status, duration_ms
  ├── public routes:
  │     GET /healthz                       (no auth)
  └── /api group (only mounted if NEON_AUTH_JWKS_URL is set):
        └── auth.RequireUser(jwks, iss, aud)   parses Bearer, validates via JWKS
              GET /api/me                       reads Sub/Email/Role from gin.Context
              POST /api/spotify/token           Phase 9b.2 (only when 4x SPOTIFY_* env vars set)
```

If `NEON_AUTH_JWKS_URL` is empty (Phase 8a not yet done) the `/api` group is **not registered** at boot time;
client calls to `/api/*` then return clean 404 instead of confusing 401s. Boot logs
`Neon Auth JWKS_URL not set; protected /api/* endpoints disabled until Phase 8a`.

If any of `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` / `SPOTIFY_TOKEN_ENC_KEY` / `SPOTIFY_REDIRECT_URI`
is empty, the Spotify handler is NOT registered; `/api/spotify/token` returns 404. Boot logs four `_set`
booleans followed by `spotify_enabled=true/false`. Never logs the values themselves.

## Key dependencies

- **gin-gonic/gin**: HTTP router and middleware
- **jackc/pgx/v5 + pgxpool**: Postgres driver, async-friendly connection pool
- **golang-jwt/jwt/v5**: JWT parsing + signature/claim validation
- **MicahParks/keyfunc/v3**: cached, auto-refreshing remote JWKS resolver for verifying Neon Auth tokens
- **caarlos0/env/v11**: env -> struct binding with required/default tags
- **joho/godotenv**: load .env in dev (no-op in prod)
- **stretchr/testify**: assertions and table-driven tests
- **pressly/goose/v3**: migration tool (binary on PATH)
- **oapi-codegen v2.7 + runtime**: generates Gin server stubs from openapi.yaml
- **sqlc**: generates typed Go from .sql files (binary install deferred on Windows)

## Health endpoint behavior

`handlers.metaHandler.health`:
1. 2-second context timeout from request context
2. `pool.Ping(ctx)` against Postgres
3. On success: 200 with `{status: "ok", db: "ok", version: "0.0.0"}`
4. On failure: 503 with `{code: "db_unavailable", message: <pgx error>}`

## Generation pipeline

```
openapi.yaml ── oapi-codegen ──► internal/oapi/server.gen.go
infra/migrations/*.sql + queries/*.sql ── sqlc ──► internal/db/sqlc/*.go
```

Both outputs are gitignored. Regenerate via `make generate`.
