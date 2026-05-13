# Spec: `GET /api/spotify/status` + `useSpotifyStatus` hook

**Slice ID**: Phase 11-followup-a (originally listed as "Spotify-side wedge #3" in
`project_phase_state.md`).

**Owner**: CrowdTune-original feature (not a Festify port). No `.reference/` read required.

**Scope**: One backend endpoint, one frontend hook, one HomePage call-site swap. No
new tables, no migrations, no new external API calls.

---

## 1. Motivation

The HomePage currently consumes `useSpotifyStatusPlaceholder()` which always returns
`{ isConnected: false, isPremium: false }`. That placeholder was filed as a deferred
concern in `docs/translation-progress.md` because:

- `POST /api/spotify/token` (Phase 9b.2) is shipped, so we can now answer "is this user
  connected to Spotify" from `spotify_credentials`.
- Premium-tier check is still deferred — Spotify Web Playback SDK requires Premium, and
  the hosting UX needs that signal — but storing or fetching it is out of scope for this
  slice.

After this slice, HomePage shows the real connection state. Premium remains a follow-up.

## 2. Contract

### HTTP

- **Method/path**: `GET /api/spotify/status`
- **Authentication**: bearer JWT, mounted under the existing `/api` group, which already
  attaches `auth.RequireUser` at the group level. **Handlers must not re-attach the
  middleware per-route** (see `feedback_group_level_auth`).
- **Request body**: none.
- **Path/query parameters**: none. The user is identified by the JWT `sub` claim, read via
  `auth.UserID(c)`.

### Response shape (200 OK)

```
{
  "isConnected": boolean,
  "isPremium":   boolean
}
```

- `isConnected` is `true` iff a row exists in `spotify_credentials` for the authenticated
  user. The row's contents (access token validity, refresh-token freshness) are NOT
  inspected by this endpoint. Validity is the job of `GetValidAccessToken` (a separate
  follow-up). A connected-but-expired user still reports `isConnected: true`; the SPA's
  next Spotify-API-call attempt will trigger refresh.
- `isPremium` is always `false` in this slice. Reasoning: we do not yet store the premium
  tier, do not yet call Spotify `/v1/me` in any backend path, and adding either expands
  scope. Returning `false` is the conservative default — non-Premium users cannot use the
  Web Playback SDK anyway, so "false until proven true" matches downstream gating. The
  field exists in the response to keep the contract stable across the deferred follow-up.
  **Filed as a follow-up GitHub issue: store `is_premium` on `spotify_credentials` and
  populate it from the Spotify Web API on token exchange / refresh.**

### Error responses

- **401 Unauthorized** — bearer missing or invalid. Body `{ "code": "missing_bearer" |
  "invalid_bearer", "message": "..." }`. Handled by the existing `/api` group
  middleware; no handler code needed.
- **500 Internal Server Error** — DB query failed for a reason other than "no row".
  Body `{ "code": "internal_error", "message": "failed to query Spotify status; please
  try again" }`. Logged via `slog.Error` with `outcome=db_error` and the wrapped err.

There is no 404 case. "No credentials row" is a normal 200 response with
`isConnected: false`; it is not an error.

## 3. Backend implementation notes

### sqlc query

A `boolean` exists-check is the right primitive — selecting the whole row, then catching
`pgx.ErrNoRows`, works but pulls bytes we throw away. Add a new named query to
`apps/api/internal/db/queries/spotify_credentials.sql`:

```
-- name: HasSpotifyCredentials :one
SELECT EXISTS (
    SELECT 1 FROM spotify_credentials WHERE user_id = $1
) AS exists;
```

Run `sqlc generate` from `apps/api/`. Commit the regenerated `spotify_credentials.sql.go`
in the same diff (per `project_sqlc_policy`).

### Storer interface

The existing `SpotifyStorer` interface (in `apps/api/internal/handlers/spotify.go`)
should be extended with the new method:

```
HasSpotifyCredentials(ctx context.Context, userID string) (bool, error)
```

`*sqlc.Queries` satisfies it after regeneration. Tests inject a fake (mirroring
`fakeStorer` in `spotify_test.go`).

### Handler

- Route registration in `RegisterSpotify` and `RegisterSpotifyWithStorer`:
  `r.GET("/spotify/status", h.getStatus)`. Both paths must be kept in sync.
- Handler body:
  1. `userID := auth.UserID(c)`
  2. `exists, err := h.store.HasSpotifyCredentials(c.Request.Context(), userID)`
  3. On `err != nil`: `slog.Error("spotify status", "user_id", userID, "outcome",
     "db_error", "err", err)`; return 500 `internal_error`.
  4. On success: `slog.Info("spotify status", "user_id", userID, "outcome", "ok",
     "connected", exists)`; return 200 `{ isConnected: exists, isPremium: false }`.
- No request body parsing; no query parameters. `c.Request.Context()` is used for the
  DB call so cancellation propagates.

### Test plan (go test, table-driven where it pays off)

In `apps/api/internal/handlers/spotify_test.go`, add:

1. **getStatus_returnsConnectedTrue_whenRowExists** — fakeStorer returns `(true, nil)`;
   assert 200 + `{ isConnected: true, isPremium: false }`.
2. **getStatus_returnsConnectedFalse_whenRowAbsent** — fakeStorer returns `(false, nil)`;
   assert 200 + `{ isConnected: false, isPremium: false }`.
3. **getStatus_returns500_onDbError** — fakeStorer returns `(false, errors.New("boom"))`;
   assert 500 + `code: "internal_error"`. Assert the response body does NOT echo the raw
   err string (no `boom` leak).
4. **getStatus_returns405_onPost** — send `POST /api/spotify/status`; assert 405. Catches
   accidental `r.POST(...)` typo against the sibling `/spotify/token` route.
5. **getStatus_returns404_onHyphenPath** — send `GET /api/spotify-status` (hyphen); assert
   404. Catches slash-vs-hyphen typos in `r.GET(...)`.
6. The existing `fakeStorer` adds a `hasErr error` and `hasResult bool` field, plus a
   `HasSpotifyCredentials` method. Existing `UpsertSpotifyCredentials` tests must not
   break.

### OpenAPI update

Add to `apps/api/openapi.yaml` under `paths:`:

```
/api/spotify/status:
  get:
    operationId: getSpotifyStatus
    tags: [spotify]
    summary: Whether the authenticated user is connected to Spotify
    security:
      - bearerAuth: []
    responses:
      '200':
        description: Connection status for the authenticated user
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/SpotifyStatus'
      '401':
        description: Bearer token missing or invalid
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ErrorResponse'
      '500':
        description: Internal server error
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ErrorResponse'
```

And a new component under `components.schemas`:

```
SpotifyStatus:
  type: object
  required: [isConnected, isPremium]
  properties:
    isConnected:
      type: boolean
      description: True iff a Spotify credentials row exists for the user.
    isPremium:
      type: boolean
      description: True iff the user has a Spotify Premium tier subscription. Currently always false; populated in a future slice that calls Spotify's /v1/me on token exchange.
```

Run `oapi-codegen --config oapi-config.yaml openapi.yaml` from `apps/api/` after editing.
Commit regenerated server stubs in the same diff.

## 4. Frontend implementation notes

### Type regeneration

Before the hook is written, run `pnpm --filter web openapi:gen` (or whatever the project's
script is — see `apps/web/package.json`). This refreshes the OpenAPI-typed schema map so
`'/api/spotify/status'` resolves to the right response shape.

### Hook location and FSD layer

- File: `apps/web/src/pages/home/model/use-spotify-status.ts`
- Public re-export from `apps/web/src/pages/home/index.ts` if the slice's existing barrel
  exposes other hooks. If not, leave it deep-importable from the HomePage call site only.
- FSD: the hook lives in `pages/home/model/` because its only consumer is HomePage. If
  another page starts to need it later, promote it to `entities/spotify/` then. Do not
  pre-promote — that is the YAGNI rule.

### Hook contract

```
type SpotifyStatus = { isConnected: boolean; isPremium: boolean }

export type UseSpotifyStatusResult = {
  data: SpotifyStatus | null
  isLoading: boolean
  error: Error | null
}

export function useSpotifyStatus(userId: string | undefined): UseSpotifyStatusResult
```

Mirror `usePartyQuery`'s shape with a user-scoped key:

- `useQuery<SpotifyStatus, Error>`
- `queryKey: ['spotifyStatus', userId]` — **must include userId**. There is no
  `queryClient.clear()` on sign-out anywhere in `apps/web/src/`, so an unscoped key
  would cache User A's status and serve it to User B on the next sign-in within the
  staleTime window. Following the precedent of `usePartyQuery`'s `['party', partyId]`
  scope-keys this hook by the only scope that matters.
- `enabled: !!userId` — skip the fetch while the session is loading; reactivates once
  HomePage's session query yields a user id.
- `queryFn: () => api<SpotifyStatus>('/api/spotify/status')`
- `staleTime: 30_000` — 30 seconds. The user's Spotify-connection state changes rarely
  but the SPA might be open for an entire party; 30 s strikes the balance.
- Returns `{ data, isLoading, error }` — never throws.

### HomePage swap

In `apps/web/src/pages/home/ui/HomePage.tsx`:

1. Replace the import of `useSpotifyStatusPlaceholder` with `useSpotifyStatus`.
2. Pass the existing session's user id into the hook. HomePage already calls
   `authClient.useSession()` (or equivalent) — reuse that user id rather than fetching
   the session a second time. While the session resolves, `userId` will be `undefined`
   and the hook's `enabled` guard keeps the query idle.
3. The destructured shape changes from `{ isConnected, isPremium }` (sync) to `{ data,
   isLoading, error }` (async). The HomePage must:
   - While `isLoading` is true on first fetch (or `data` is null because the query is
     disabled pending session): treat as `{ isConnected: false, isPremium: false }`.
     This is the same conservative default the placeholder already produced; the
     existing JSX needs no new spinner.
   - On `error`: fall back to `{ isConnected: false, isPremium: false }` semantics
     (treat the API failure as "not connected"). **Do not add `console.warn`** — the
     repo's TypeScript rules ban console statements in production. A one-line comment
     "// silent fallback; toast system pending" is the right placeholder.
   - On `data`: thread `data.isConnected` and `data.isPremium` into the same JSX
     branches the placeholder fed.
4. **Do not** remove `use-spotify-status-placeholder.ts` in this slice unless HomePage
   was the only consumer (a grep will confirm). If anything else still imports it, leave
   the file in place with an `@deprecated` JSDoc and file a follow-up issue to delete it.

### Tests

Add `apps/web/src/pages/home/model/use-spotify-status.test.ts`:

1. **returns_data_when_api_returns_200** — mock `api()` (via `vi.mock('@/shared/api')`) to
   resolve with `{ isConnected: true, isPremium: false }`; render the hook with a
   QueryClient and a userId; assert `data` matches.
2. **returns_null_data_while_loading** — initial render before resolve.
3. **returns_error_when_api_rejects** — mock `api()` to throw an `ApiError(500, ...)`;
   assert `error` is truthy and `data` is null.
4. **stays_idle_when_userId_undefined** — render the hook with `undefined`; assert
   `isLoading` is false (query disabled) and `data` is null. Confirms the `enabled`
   guard works.
5. **caches_per_user_across_renders** — render with `'userA'`, mock `api()` returning
   `{ isConnected: true, isPremium: false }`; unmount; re-render with `'userB'` on the
   same QueryClient, mock `api()` returning `{ isConnected: false, isPremium: false }`.
   Assert each render observes its own user's data, not a stale cache hit. This is the
   regression test that proves the user-scoped key actually works.

Optionally, update the HomePage test to assert the live-data path renders the "Connected
to Spotify" branch when the mocked query resolves with `isConnected: true`. Only do this
if the existing HomePage tests already exercise this branch via the placeholder — do not
expand HomePage test coverage in this slice.

## 5. Out of scope (file as follow-ups)

- **Persisting `is_premium` on `spotify_credentials`** and populating it via Spotify
  `/v1/me`. Requires a migration + Spotify API call wiring. File as a GitHub issue with
  this spec link.
- **Auto-refresh of `isPremium` over the life of a session** (e.g. when the user
  upgrades to Premium without re-authenticating).
- **`useSpotifyStatus` invalidation on auth state change.** If the auth-client
  TanStack-cache-invalidation behavior is not already wired, this is a separate hook
  observability bug, not a status-endpoint concern.
- **Cleanup of `use-spotify-status-placeholder.ts`** if it has any remaining importer
  besides HomePage.

## 6. Acceptance criteria

- `go test ./...` from `apps/api/` exits 0; new tests appear in coverage.
- `pnpm --filter web test` exits 0; the hook test file appears in the report.
- `pnpm --filter web typecheck` exits 0.
- `go vet ./...` exits 0.
- HomePage no longer imports `useSpotifyStatusPlaceholder`.
- The new `GET /api/spotify/status` route appears in `openapi.yaml` and the regenerated
  server stubs.
- The regenerated TS types resolve `'/api/spotify/status'` to the new `SpotifyStatus`
  shape.
- `/security-review` passes on the diff (auth-protected route, no PII in logs, no token
  leakage in error bodies).
