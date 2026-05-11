-- +goose Up
-- Phase 9a: Spotify credentials store.
-- One row per host user; Phase 9b's token-exchange and refresh handlers write
-- and read this table. The refresh token is stored AES-GCM encrypted (handler
-- concern); the migration stores opaque text only.
--
-- gen_random_uuid() is available because pgcrypto was enabled in
-- 20260510131525_init.sql.
--
-- user_id is uuid (not text) because neon_auth."user".id is uuid in the
-- Better-Auth-backed Neon Auth schema. Postgres FK requires the referencing
-- column to share the data type with the referenced column. The JWT sub
-- claim that handlers receive is the canonical UUID textual form; pgx
-- accepts a Go string when binding to a uuid parameter, and sqlc.yaml
-- overrides the codegen to keep the Go-side type as string for ergonomics.
--
-- FK targets neon_auth."user"(id) - "user" must be quoted because it is a
-- Postgres reserved word. ON DELETE CASCADE removes credentials when Better
-- Auth deletes the user row.
CREATE TABLE spotify_credentials (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid        NOT NULL UNIQUE,
    access_token            text        NOT NULL,
    access_token_expires_at timestamptz NOT NULL,
    refresh_token_encrypted text        NOT NULL,
    scopes                  text        NOT NULL DEFAULT '',
    last_refreshed_at       timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_spotify_credentials_user
        FOREIGN KEY (user_id)
        REFERENCES neon_auth."user" (id)
        ON DELETE CASCADE
);

-- +goose Down
DROP TABLE IF EXISTS spotify_credentials;
