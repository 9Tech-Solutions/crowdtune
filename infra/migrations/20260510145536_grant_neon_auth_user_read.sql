-- +goose Up
-- +goose StatementBegin
-- Phase 8f: grant our application role read access to Neon Auth's user table.
--
-- Neon Auth (Better-Auth-based) creates the schema `neon_auth` with tables:
--   user, session, account, verification, invitation, member, organization,
--   project_config, jwks.
--
-- The "users_sync" naming from older Stack-Auth-era Neon docs is gone in the
-- current Better Auth-based setup. Our app JOINs against `neon_auth."user"`
-- (note: "user" is a reserved word and must be quoted).
--
-- The DO block guards run loudly if the schema is missing - i.e. Phase 8a is
-- not yet done. The IF EXISTS on the table grant tolerates schema layout
-- evolution by Neon Auth.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'neon_auth') THEN
    RAISE EXCEPTION
      'neon_auth schema is missing. Enable Neon Auth in the Neon Console (Phase 8a) before running this migration.';
  END IF;
END $$;

GRANT USAGE ON SCHEMA neon_auth TO PUBLIC;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'neon_auth' AND table_name = 'user'
  ) THEN
    EXECUTE 'GRANT SELECT ON neon_auth."user" TO PUBLIC';
  ELSE
    RAISE EXCEPTION
      'neon_auth.user table is missing. Verify Neon Auth has finished provisioning.';
  END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'neon_auth' AND table_name = 'user'
  ) THEN
    EXECUTE 'REVOKE SELECT ON neon_auth."user" FROM PUBLIC';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'neon_auth') THEN
    REVOKE USAGE ON SCHEMA neon_auth FROM PUBLIC;
  END IF;
END $$;
-- +goose StatementEnd
