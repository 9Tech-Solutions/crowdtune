-- Party queries.
-- Table: parties (created by infra/migrations/20260512113057_add_parties_queue_tracks_user_votes.sql)
-- One row per party. The id is a 6-character alphanumeric short code generated
-- server-side. The host_user_id maps to the JWT sub claim (Better-Auth user id).

-- name: CreateParty :one
INSERT INTO parties (id, host_user_id, name, settings)
VALUES (@id, @host_user_id, @name, @settings)
RETURNING *;

-- name: GetParty :one
SELECT * FROM parties WHERE id = @id;
