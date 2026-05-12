-- User vote queries.
-- Table: user_votes (created by infra/migrations/20260512113057_add_parties_queue_tracks_user_votes.sql)
-- One row per (party_id, provider, provider_track_id, user_id); PK ensures idempotency.

-- name: InsertVote :exec
INSERT INTO user_votes (party_id, provider, provider_track_id, user_id)
VALUES (@party_id, @provider, @provider_track_id, @user_id)
ON CONFLICT DO NOTHING;

-- name: DeleteVote :exec
DELETE FROM user_votes
WHERE party_id = @party_id
  AND provider = @provider
  AND provider_track_id = @provider_track_id
  AND user_id = @user_id;

-- name: CountVotesForTrack :one
SELECT COUNT(*)::integer AS vote_count
FROM user_votes
WHERE party_id = @party_id
  AND provider = @provider
  AND provider_track_id = @provider_track_id;
