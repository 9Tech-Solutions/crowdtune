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
- `[i]` `selectors/track.ts` - track-related selectors. Spec at `docs/specs/selectors-track.spec.md` passed firewall review. Implemented 9 pure functions in `apps/web/src/entities/track/lib/` (identity.ts, queue.ts, labels.ts, load-candidates.ts) with 67 Vitest tests covering every section-5 edge case. Lock-now decisions applied: sort by `Track.order` ascending with NaN guard treated as +Infinity; tie-break by `addedAt` lex string compare; strict `===` equality with `== null` idiom only for null/undefined collapse; duration unit `minutes * 60_000` ms; vote-status display strings are CrowdTune-original copy (`'Now playing'` / `'Paused'` / `${n} votes` / `'1 vote'` / `'Host pick'` / `'Pending'`), not Festify verbatim. State-reading accessors (spec sections 2b-2e) intentionally skipped - we have no Redux store; consumers pass data into pure functions directly. Spec-fidelity review by typescript-reviewer: all 9 functions matched, no firewall breach, FSD downward-only flow verified (`labels.ts` imports `Playback` from `@/entities/party` as a permitted same-layer exception). Typecheck exit 0; 68 tests pass (67 new + 1 pre-existing HomePage).

## Cloud Functions (`.reference/festify/functions/`)

(none yet)

## Notes

- We do **not** plan to port Festify's Polymer custom-element tooling, Polymer iconset, or its specific
  Firebase RTDB schema layout. Those are implementation details we redesign for our React + Postgres stack.
- We **do** plan to preserve Festify's domain model: parties identified by short codes, fallback playlists,
  upvote-only voting (no downvotes), stable-sort with vote counts, anonymous guest joining.
