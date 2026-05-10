<!-- Generated: 2026-05-10 | Files scanned: 4 | Token estimate: ~500 -->

# Backend (apps/api)

## Routes (current)

| Method | Path | Handler | Description |
|---|---|---|---|
| GET | /healthz | handlers.metaHandler.health | Liveness + DB ping |

The OpenAPI contract lives at `apps/api/openapi.yaml`. Run `make openapi` to regenerate `internal/oapi/server.gen.go`.

## Layered structure

```
cmd/api/main.go         wire-up: config -> pgxpool -> gin -> handlers -> http.Server with graceful shutdown
  │
  ▼
internal/config         caarlos0/env-driven Config struct (DATABASE_URL, host, port, env, log level)
internal/handlers       one file per resource; today only meta.go
internal/db/queries     .sql files for sqlc (empty in Phase 0)
internal/db/sqlc        sqlc-generated, gitignored
internal/oapi           oapi-codegen output, gitignored
internal/domain         pure types (no I/O), reserved for future
```

## Middleware chain

```
gin.New()
  └── gin.Recovery()                       panic catch
  └── requestLogger(slog)                  method, path, status, duration_ms
  └── route handlers
```

## Key dependencies

- **gin-gonic/gin**: HTTP router and middleware
- **jackc/pgx/v5 + pgxpool**: Postgres driver, async-friendly connection pool
- **caarlos0/env/v11**: env -> struct binding with required/default tags
- **joho/godotenv**: load .env in dev (no-op in prod)
- **stretchr/testify**: assertions and table-driven tests
- **pressly/goose/v3**: migration tool (binary on PATH)
- **oapi-codegen v2.7**: generates Gin server stubs from openapi.yaml
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
