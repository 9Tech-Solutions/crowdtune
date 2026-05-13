-- +goose Up
-- Phase 10 hardening: enforce at-most-one playing track per party at the DB
-- level so the TOCTOU race in the vote handler cannot produce two rows with
-- order_idx = playingSentinel for the same party.
--
-- The vote handler's algorithm reads the topmost track and the affected track
-- under READ COMMITTED with SELECT ... FOR UPDATE on the affected row, but the
-- topmost-track read is NOT held under a row lock. Two concurrent first-vote
-- transactions on different tracks of an empty queue would both observe
-- "no playing track" and both insert with playingSentinel as order_idx.
--
-- This partial unique index closes the race by failing the second INSERT
-- (or UPDATE-to-sentinel) with SQLSTATE 23505. The vote handler's outer retry
-- loop re-runs the whole transaction; the second attempt will see the now-
-- existing playing track via GetTopmostTrack and route the new track through
-- the normal formula instead.
--
-- The literal -9007199254740990 is Number.MIN_SAFE_INTEGER + 1, the value
-- the handler writes to mark a track as playing. Kept JS-compatible so the
-- value round-trips cleanly to a JS frontend.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_playing_per_party
    ON queue_tracks (party_id)
    WHERE order_idx = -9007199254740990;

-- +goose Down
DROP INDEX IF EXISTS idx_one_playing_per_party;
