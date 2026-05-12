-- +goose Up
-- Phase 10b.1: vote-processor backend port — core party and queue tables.
-- Spec: docs/specs/vote-processor.spec.md
-- Orchestrator lock-now decisions: docs/translation-progress.md (Phase 10a entry)
--
-- parties        — one row per live or ended party; owned by a host user.
--                  1 host user : N parties.
-- queue_tracks   — the working queue of tracks inside a party.
--                  1 party : N queue_tracks (composite PK prevents duplicates per
--                  provider+track within a party).
-- user_votes     — one vote per user per track per party; drives queue ranking.
--                  1 queue_track : N user_votes (no FK enforced; see note below).
--
-- Unusual choices called out:
--   (1) queue_tracks uses "order_idx" not "order" because ORDER is a SQL reserved
--       word; "order_idx" avoids quoting every reference to it.
--   (2) user_votes has NO foreign key to queue_tracks. A vote can be the event that
--       creates the queue_tracks row inside the same transaction, so an FK would
--       force an ordering that is impossible to satisfy without two round-trips.
--       The Go handler enforces referential consistency in application logic.
--
-- Party id is application-generated (6-character alphanumeric short code with
-- collision-retry in Go). No DEFAULT clause — the application must supply the value.
--
-- gen_random_uuid() is available because pgcrypto was enabled in
-- 20260510131525_init.sql.

CREATE TABLE parties (
    id             text        PRIMARY KEY,
    host_user_id   uuid        NOT NULL,
    name           text        NOT NULL,
    settings       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    is_active      boolean     NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT fk_parties_host_user
        FOREIGN KEY (host_user_id)
        REFERENCES neon_auth."user" (id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parties_host_user_id
    ON parties (host_user_id);

CREATE TABLE queue_tracks (
    party_id          text    NOT NULL,
    provider          text    NOT NULL,
    provider_track_id text    NOT NULL,
    vote_count        integer NOT NULL DEFAULT 0,
    order_idx         bigint  NOT NULL,
    is_fallback       boolean NOT NULL DEFAULT false,
    added_at          timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (party_id, provider, provider_track_id),

    CONSTRAINT chk_queue_tracks_vote_count_non_negative
        CHECK (vote_count >= 0),

    CONSTRAINT fk_queue_tracks_party
        FOREIGN KEY (party_id)
        REFERENCES parties (id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_queue_tracks_party_order
    ON queue_tracks (party_id, order_idx ASC);

CREATE TABLE user_votes (
    party_id          text        NOT NULL,
    provider          text        NOT NULL,
    provider_track_id text        NOT NULL,
    user_id           uuid        NOT NULL,
    voted_at          timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (party_id, provider, provider_track_id, user_id),

    CONSTRAINT fk_user_votes_party
        FOREIGN KEY (party_id)
        REFERENCES parties (id)
        ON DELETE CASCADE,

    CONSTRAINT fk_user_votes_user
        FOREIGN KEY (user_id)
        REFERENCES neon_auth."user" (id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_votes_party_user
    ON user_votes (party_id, user_id);

-- +goose Down
DROP TABLE IF EXISTS user_votes;
DROP TABLE IF EXISTS queue_tracks;
DROP TABLE IF EXISTS parties;
