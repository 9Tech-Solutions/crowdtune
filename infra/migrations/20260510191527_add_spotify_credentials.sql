-- +goose Up
-- Phase 9a: Spotify credentials store.
-- One row per host user; Phase 9b's token-exchange and refresh handlers write
-- and read this table. The refresh token is stored AES-GCM encrypted (handler
-- concern); the migration stores opaque text only.
--
-- gen_random_uuid() is available because pgcrypto was enabled in
-- 20260510131525_init.sql.
--
-- FK targets neon_auth."user"(id) - "user" must be quoted because it is a
-- Postgres reserved word. ON DELETE CASCADE removes credentials when Better
-- Auth deletes the user row.
CREATE TABLE spotify_credentials (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 text        NOT NULL UNIQUE,
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
