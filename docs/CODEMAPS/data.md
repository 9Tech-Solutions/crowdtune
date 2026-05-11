<!-- Generated: 2026-05-11 | Files scanned: 3 migrations, 1 query file | Token estimate: ~400 -->

# Data (Postgres on Neon)

## Engine

PostgreSQL on [Neon](https://neon.tech) serverless. Two URLs:

- `DATABASE_URL` (pooled, via Neon's PgBouncer-equivalent) — used by the API runtime
- `DATABASE_URL_DIRECT` (direct connection) — used by goose migrations

Both have `sslmode=require`.

## Migration history

| Version | File | Effect | Applied to live DB? |
|---|---|---|---|
| 20260510131525 | infra/migrations/20260510131525_init.sql | Enable extensions: `pgcrypto`, `citext` | yes |
| 20260510145536 | infra/migrations/20260510145536_grant_neon_auth_user_read.sql | Grant USAGE + SELECT on `neon_auth."user"` to the application role (Better Auth's user table) | yes |
| 20260510191527 | infra/migrations/20260510191527_add_spotify_credentials.sql | Create `spotify_credentials` table for Phase 9 OAuth token store | **NOT yet** (user runs `goose up` when ready) |

Schema grows in feature phases following the goose-migration-author agent's contract:

- Always created via `goose -dir infra/migrations create <name> sql`.
- Always include a working `-- +goose Down` block.
- One concern per migration. Never edit an already-applied migration.

## Application tables (current)

### `spotify_credentials` (Phase 9a, not yet applied)

One row per host user storing Spotify OAuth credentials. The refresh token is AES-256-GCM encrypted by the API at write time; the migration stores opaque text.

| Column | Type | Notes |
|---|---|---|
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() | surrogate key |
| user_id | text NOT NULL UNIQUE | FK to `neon_auth."user"(id) ON DELETE CASCADE` (reserved word, quoted) |
| access_token | text NOT NULL | plaintext, short-lived (~1 hour) cache; rotated by RefreshAccessToken |
| access_token_expires_at | timestamptz NOT NULL | absolute expiry of the cached access token |
| refresh_token_encrypted | text NOT NULL | base64-encoded AES-GCM ciphertext (nonce prepended) |
| scopes | text NOT NULL DEFAULT '' | space-delimited Spotify scope string |
| last_refreshed_at | timestamptz NULL | null until first refresh; updated by RefreshAccessToken path |
| created_at | timestamptz NOT NULL DEFAULT now() | row creation time |
| updated_at | timestamptz NOT NULL DEFAULT now() | last write time |

sqlc queries (in `internal/db/queries/spotify_credentials.sql`): `UpsertSpotifyCredentials` (ON CONFLICT user_id DO UPDATE), `GetSpotifyCredentialsByUserID`, `DeleteSpotifyCredentialsByUserID`.

## Driver and codegen

- Runtime driver: `jackc/pgx/v5` + `pgxpool`.
- Typed queries: sqlc from `internal/db/queries/*.sql` -> `internal/db/sqlc/*.go`. **Generated code is COMMITTED** as of 2026-05-11 (`86ec609`). Edit a query -> run `sqlc generate` -> commit the diff together. See `project_sqlc_policy.md` in memory.
- Configuration: `apps/api/sqlc.yaml` targets engine `postgresql`, sql_package `pgx/v5`, with json tags and an interface.

## Conventions (locked)

- Identifiers: snake_case, lower-case
- Primary keys: `BIGINT GENERATED ALWAYS AS IDENTITY`
- Timestamps: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- Soft delete (when used): `deleted_at TIMESTAMPTZ`
- UUIDs (when used): `gen_random_uuid()` from `pgcrypto`
- Foreign keys: explicit `ON DELETE`, default `RESTRICT`
- Indexes: separate statement after table create, `CREATE INDEX IF NOT EXISTS`
