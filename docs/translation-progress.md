# Translation Progress

Tracks every Festify file we plan to port. Add entries as we pick targets. Update as items move through the
clean-room workflow described in `docs/translation-workflow.md`.

## Legend

- `[ ]` queued
- `[~]` translator-spec drafted, in review
- `[s]` spec approved, awaiting implementation
- `[i]` implementation in progress
- `[x]` shipped (commit hash linked)

## Frontend components (`.reference/festify/src/`)

- `[i]` `state.ts` - root domain types. Spec at `docs/specs/state.spec.md` passed firewall review. Implemented so far: `Party`, `PartySettings`, `Playback` (entities/party); `Track`, `TrackReference`, `Metadata` (entities/track); `Playlist`, `PlaylistReference` (entities/playlist); `Image` (shared/model, lifted out of party to avoid same-layer cross-slice import). Deferred: `ConnectionState`, view-layer state shapes, `User` slice (waits on Neon Auth shape), `Player` slice (waits on Phase 9 Spotify SDK), Zustand stores. Lock-now decisions applied: ISO 8601 timestamp strings on the wire, `spotifyUserId` rename, `provider: 'spotify'` literal union, camelCase fields throughout. Typecheck green. Commits: 6b15b11 (HeroUI directive), 0c7b728 (entity types).
- `[i]` `selectors/track.ts` - track-related selectors. Spec at `docs/specs/selectors-track.spec.md` passed firewall review. Implemented 9 pure functions in `apps/web/src/entities/track/lib/` (identity.ts, queue.ts, labels.ts, load-candidates.ts) with 67 Vitest tests covering every section-5 edge case. Lock-now decisions applied: sort by `Track.order` ascending with NaN guard treated as +Infinity; tie-break by `addedAt` lex string compare; strict `===` equality with `== null` idiom only for null/undefined collapse; duration unit `minutes * 60_000` ms; vote-status display strings are CrowdTune-original copy (`'Now playing'` / `'Paused'` / `${n} votes` / `'1 vote'` / `'Host pick'` / `'Pending'`), not Festify verbatim. State-reading accessors (spec sections 2b-2e) intentionally skipped - we have no Redux store; consumers pass data into pure functions directly. Spec-fidelity review by typescript-reviewer: all 9 functions matched, no firewall breach, FSD downward-only flow verified (`labels.ts` imports `Playback` from `@/entities/party` as a permitted same-layer exception). Typecheck exit 0; 68 tests pass (67 new + 1 pre-existing HomePage). Commit: 2d3a258.
- `[i]` `selectors/party.ts` - party-related selectors. Spec at `docs/specs/selectors-party.spec.md` passed firewall review. Implemented 5 pure functions in `apps/web/src/entities/party/lib/party-selectors.ts` (`isHost`, `playbackMasterId`, `isPlaybackMaster`, `hasOtherPlaybackMaster`, `playbackState`) with 37 Vitest tests covering every section-5 edge case. Lock-now decisions applied: strict `===` host check via JWT `sub` claim vs `party.createdBy`; plain `boolean` return (no tri-state); empty-string master id treated as "no master designated" (same as null); `localInstanceId` accepted as `string | null | undefined` with empty-string normalization. Spec function 2b (party identifier accessor) dropped - TanStack Router's `useParams` provides this in components. Spec-fidelity review by typescript-reviewer: all 5 functions matched, no firewall breach, FSD intra-slice imports only. Typecheck exit 0; 105 tests pass (37 new). Note: `isPlaybackMaster` / `hasOtherPlaybackMaster` accept `localInstanceId` as a parameter; the player-instance-id Zustand slice that supplies it is a separate future port (deferred per state.ts open question).

## Cloud Functions (`.reference/festify/functions/`)

- `[i]` `functions/lib/spotify-auth.ts` - Spotify OAuth handshake + refresh token storage. Phase 9 backend wedge. Spec at `docs/specs/spotify-auth.spec.md` passed firewall review. Locked: per-user credentials row, server-side encrypted refresh tokens, AES-GCM with fresh nonce per write, key from `SPOTIFY_TOKEN_ENC_KEY` env var. Slice plan:
  - **9a (DONE this slice)**: `infra/migrations/20260510191527_add_spotify_credentials.sql` creates the `spotify_credentials` table with 9 columns, UNIQUE on `user_id`, FK to `neon_auth."user"(id) ON DELETE CASCADE`. Down is `DROP TABLE`. Migration not yet applied to the live database (user runs `goose up` when ready).
  - **9b (next)**: `apps/api/internal/crypto/` AES-GCM helpers + `apps/api/internal/spotify/` exchange + refresh internals + Handler A (`POST /api/spotify/token`) + OpenAPI entries + env-var additions.
  - **9c**: `/security-review` of the whole, then merge.
  - Handler C (catalog client-credential token) deferred until search is needed. Handler D (account linking) likely fully replaced by Better Auth's native OAuth provider linking - evaluate before writing any code.

## Notes

- We do **not** plan to port Festify's Polymer custom-element tooling, Polymer iconset, or its specific
  Firebase RTDB schema layout. Those are implementation details we redesign for our React + Postgres stack.
- We **do** plan to preserve Festify's domain model: parties identified by short codes, fallback playlists,
  upvote-only voting (no downvotes), stable-sort with vote counts, anonymous guest joining.
