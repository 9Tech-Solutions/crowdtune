# Migrations

Postgres migrations managed by [goose](https://github.com/pressly/goose).

## Run

Set `DATABASE_URL_DIRECT` in `.env` (use Neon's **direct** URL, not the pooler, for migrations):

```bash
goose -dir infra/migrations postgres "$DATABASE_URL_DIRECT" status
goose -dir infra/migrations postgres "$DATABASE_URL_DIRECT" up
goose -dir infra/migrations postgres "$DATABASE_URL_DIRECT" down
```

Or use the API Makefile target:

```bash
cd apps/api && make migrate-up
```

## Add a new migration

**Always use the CLI; never hand-create the file:**

```bash
goose -dir infra/migrations create <descriptive_name> sql
```

Then edit only the generated file. Provide a working `-- +goose Down` section. Never edit a migration that
has already been applied to a shared environment - write a new migration instead.

## Conventions

- One concern per migration. Do not bundle table create + seed + unrelated index.
- Use `IDENTITY` not `SERIAL`. Use `TIMESTAMPTZ NOT NULL DEFAULT NOW()`. snake_case identifiers.
- Foreign keys with explicit `ON DELETE`. Default to `RESTRICT` unless cascade is intentional.
- Indexes on a separate statement after the table create, with `IF NOT EXISTS`.
