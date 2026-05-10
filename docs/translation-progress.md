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

(none yet - Phase 5 will scaffold the empty React app first)

## Cloud Functions (`.reference/festify/functions/`)

(none yet)

## Notes

- We do **not** plan to port Festify's Polymer custom-element tooling, Polymer iconset, or its specific
  Firebase RTDB schema layout. Those are implementation details we redesign for our React + Postgres stack.
- We **do** plan to preserve Festify's domain model: parties identified by short codes, fallback playlists,
  upvote-only voting (no downvotes), stable-sort with vote counts, anonymous guest joining.
