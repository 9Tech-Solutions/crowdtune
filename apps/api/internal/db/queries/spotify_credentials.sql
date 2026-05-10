-- Spotify credentials queries.
-- Table: spotify_credentials (created by infra/migrations/20260510191527_add_spotify_credentials.sql)
-- One row per authenticated host user. The refresh token is stored AES-GCM
-- encrypted; only the ciphertext (base64 text) is persisted here.

-- name: UpsertSpotifyCredentials :one
INSERT INTO spotify_credentials (
    user_id,
    access_token,
    access_token_expires_at,
    refresh_token_encrypted,
    scopes,
    last_refreshed_at
) VALUES (
    @user_id,
    @access_token,
    @access_token_expires_at,
    @refresh_token_encrypted,
    @scopes,
    @last_refreshed_at
)
ON CONFLICT (user_id) DO UPDATE SET
    access_token            = EXCLUDED.access_token,
    access_token_expires_at = EXCLUDED.access_token_expires_at,
    refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
    scopes                  = EXCLUDED.scopes,
    last_refreshed_at       = EXCLUDED.last_refreshed_at,
    updated_at              = now()
RETURNING *;

-- name: GetSpotifyCredentialsByUserID :one
SELECT *
FROM spotify_credentials
WHERE user_id = @user_id;

-- name: DeleteSpotifyCredentialsByUserID :exec
DELETE FROM spotify_credentials
WHERE user_id = @user_id;
