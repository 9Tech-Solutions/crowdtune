-- +goose Up
-- +goose StatementBegin
-- Phase 8f: grant our application role read access to the synced user table
-- that Neon Auth maintains. This migration is INTENTIONALLY pending until
-- Neon Auth has been provisioned in the project (Phase 8a). Running it
-- before the neon_auth schema exists will fail loudly, which is correct -
-- it stops you from booting an unprepared environment.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'neon_auth') THEN
    RAISE EXCEPTION
      'neon_auth schema is missing. Enable Neon Auth in the Neon Console (Phase 8a) before running this migration.';
  END IF;
END $$;

GRANT USAGE ON SCHEMA neon_auth TO PUBLIC;
GRANT SELECT ON neon_auth.users_sync TO PUBLIC;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'neon_auth') THEN
    REVOKE SELECT ON neon_auth.users_sync FROM PUBLIC;
    REVOKE USAGE ON SCHEMA neon_auth FROM PUBLIC;
  END IF;
END $$;
-- +goose StatementEnd
