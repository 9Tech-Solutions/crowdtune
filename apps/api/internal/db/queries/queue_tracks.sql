-- Queue track queries.
-- Table: queue_tracks (created by infra/migrations/20260512113057_add_parties_queue_tracks_user_votes.sql)
-- One row per unique (party_id, provider, provider_track_id) combination.
-- order_idx drives the playback queue order; tiebreaker is added_at ASC.

-- name: ListQueueTracksByParty :many
SELECT party_id, provider, provider_track_id, vote_count, order_idx, is_fallback, added_at
FROM queue_tracks
WHERE party_id = @party_id
ORDER BY order_idx ASC, added_at ASC;
