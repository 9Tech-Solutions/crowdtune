<!-- Generated: 2026-05-10 | Files scanned: 1 | Token estimate: ~200 -->

# Data (Postgres on Neon)

## Engine

PostgreSQL on [Neon](https://neon.tech) serverless. Two URLs:

- `DATABASE_URL` (pooled, via Neon's PgBouncer-equivalent) — used by the API runtime
- `DATABASE_URL_DIRECT` (direct connection) — used by goose migrations

Both have `sslmode=require`.

## Migration history

| Version | File | Effect |
|---|---|---|
| 20260510131525 | infra/migrations/20260510131525_init.sql | Enable extensions: `pgcrypto`, `citext` |

No application tables yet. Schema grows in Phase 9+ (feature work) following the goose-migration-author agent's contract:

- Always created via `goose -dir infra/migrations create <name> sql`.
- Always include a working `-- +goose Down` block.
- One concern per migration. Never edit an already-applied migration.

## Driver and codegen

- Runtime driver: `jackc/pgx/v5` + `pgxpool`.
- Typed queries: sqlc from `internal/db/queries/*.sql` -> `internal/db/sqlc/*.go` (gitignored).
- Configuration: `apps/api/sqlc.yaml` targets engine `postgresql`, sql_package `pgx/v5`, with json tags and an interface.

## Conventions (locked)

- Identifiers: snake_case, lower-case
- Primary keys: `BIGINT GENERATED ALWAYS AS IDENTITY`
- Timestamps: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- Soft delete (when used): `deleted_at TIMESTAMPTZ`
- UUIDs (when used): `gen_random_uuid()` from `pgcrypto`
- Foreign keys: explicit `ON DELETE`, default `RESTRICT`
- Indexes: separate statement after table create, `CREATE INDEX IF NOT EXISTS`
