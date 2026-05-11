# Spec: Party Track Search Sub-View

Translation source: Festify `views/party-track-search.ts`
Translation date: 2026-05-11
Status: Seventh UI port. This is the search-and-add sub-view of the party page. It mounts as a sibling route to the party queue, not as a drawer or overlay. It lets any party participant find Spotify tracks and vote them into the queue in a single tap.

---

## 1. Purpose

This view gives every party participant - host and guest alike - a way to discover new music and add it to the live queue without leaving the party screen. The participant types a search term, sees a list of matching Spotify tracks, and taps a single button to vote a track into the queue. If the track is already in the queue, the row shows its current vote count so the participant knows it is already queued. The view is a self-contained sub-view of the party page, mounted when the URL sub-path indicates the user has navigated to the search panel. It is not a modal, not a drawer, and not a persistent sidebar; it occupies the same main-content slot as the party queue list view, and switching between queue and search is a route-level navigation.

An important behavioral note on the source's architecture: the search sub-view re-uses the exact same row template and action set as the party queue row. The "add to queue" action is expressed as a vote action. When a participant taps the add button on a search result that is not yet in the queue, they cast the first vote for that track, which simultaneously adds it to the queue and gives it one vote. There is no separate "add" endpoint distinct from "vote". The CrowdTune spec intentionally decouples these: the search row has a dedicated "Add to queue" call-to-action, but the underlying mutation is still a vote - see section 4 and section 7.

---

## 2. Public Contract

### 2a. Inputs

The search sub-view receives or derives the following from its environment:

| Input | Type | Required | Description and valid values |
|---|---|---|---|
| Party identifier | String | Yes | The unique identifier for the current party session, obtained from the URL path parameter (the same `partyId` used by the party page shell at `apps/web/src/pages/party/`). **The widget reads this via TanStack Router's `useParams` hook internally; it is NOT passed as a React prop from the route file.** The route file at `src/routes/party.$partyId.search.tsx` is a thin binding that mounts the widget without passing any data. Never null while this view is mounted; the route guard ensures the party is loaded before this sub-view renders. |
| Search query | String | Yes (may be empty) | The current text the participant has entered in the search input. In the CrowdTune port this is tracked as a URL query parameter so that the browser back button restores the previous query, and as local component state for the debounced input value. Empty string is valid and produces the initial/idle state (no search issued). |
| Authenticated user identity | String or null | Yes | The current user's identifier from the session. May be null for unauthenticated (anonymous) guests if the party allows anonymous participation. Used to determine whether the add-to-queue action requires a sign-in prompt. |
| Party queue snapshot | Map from track identity string to Track record | Yes | The set of tracks currently in the queue, used to detect whether a search result is already queued (which affects the vote count shown on the result row and the add button's visual state). Provided by the TanStack Query cache for the party's queue, already available from the party page shell's data layer. |

### 2b. Outputs, events, and responses

The sub-view itself emits no domain events outward. All mutations are expressed through the hooks described in section 4. Visible outputs to the user are:

- A rendered list of search result rows when a query is active and results are available.
- A loading indicator while a search is in flight.
- An empty-state message when no results match the query (copy: CrowdTune-original - proposed as "No tracks found. Try a different search term." - mark for product copy review).
- An idle-state prompt when no query has been entered yet (copy: CrowdTune-original - proposed as "Search for songs to add to the queue." - mark for product copy review).
- An error state message when the search request fails (copy: CrowdTune-original - proposed as "Search is unavailable right now. Please try again." - mark for product copy review).
- A transient "added" visual state on a result row immediately after the participant taps the add button (the row's add button changes to a confirmation indicator for a brief period, then the row either disappears from results or remains with its queue vote count shown).

### 2c. State observed (read from shared application state)

- **Party queue data**: the complete set of tracks in the current queue, including their vote counts and fallback flags. Read from the TanStack Query cache, the same cache entry used by the party queue view. The search view uses this to overlay each result row with the track's current queue vote count if it is already queued.
- **Authentication state**: the current user's identity and sign-in status. Read from the Neon Auth / Better Auth client at `@/shared/auth`. Used to gate the add-to-queue action.
- **Search results**: the list of tracks returned by the most recent successful search. Held in the TanStack Query cache keyed by the debounced query string and the party identifier. This is the only state owned by the search data layer.
- **Search status flags**: whether a search is currently loading, has errored, or is idle. Read from the TanStack Query status for the search query.
- **Add-to-queue mutation status**: whether an add mutation is in flight for a specific track. Read from the TanStack Query mutation state keyed by track identity. Used to put the add button into a pending/disabled state on the corresponding row while the mutation settles.

### 2d. State mutated

- **Party queue**: when the participant adds a track, a vote is cast (which creates the queue entry if the track is not yet queued, or increments the vote count if it is). This mutates the backend queue data and is reflected in the TanStack Query cache after the mutation settles and the cache is invalidated or updated.
- **URL query parameter**: the search query string is written to the URL so that navigation history captures it. Managed by TanStack Router's search-param API.

---

## 3. Behavior

### Initial state (idle, no query entered)

When the view mounts and no query is in the URL, the search input is focused automatically so the participant can begin typing immediately without tapping the input first. The main content area below the input shows the idle-state prompt (see proposed copy in section 2b). No search is issued. No loading indicator is shown.

If the URL already contains a query parameter when the view mounts (for example, the participant pressed the browser back button to return to a previous search), the input is pre-populated with that query and the search fires immediately with the restored query value, bypassing the debounce for the initial load.

### Search input behavior

The search input is a single-line text field at the top of the view. As the participant types, the input updates local state on every keystroke. A debounce of 300 milliseconds is applied before any search request is issued. If the participant types continuously, only the final value after the typing pause triggers a search.

The search does not require a minimum query length beyond at least one non-whitespace character. A query composed entirely of whitespace is treated as empty and does not trigger a search. The query string is trimmed before being sent to the search endpoint.

Pressing Enter in the search input cancels any pending debounce timer and triggers the search immediately with the current input value.

Pressing Escape while the search input is focused clears the input text, resets the displayed results (returning to the idle state), removes the URL query parameter, and keeps focus on the input so the participant can begin a new search without an additional tap.

### Debounced search flow

After the 300 ms debounce settles with a non-empty, non-whitespace query, the view writes the trimmed query to the URL as a search parameter, then issues a search request. While the request is in flight, a loading indicator replaces the results area (or overlays it if the previous results are kept visible during re-fetching - see open question 1 in section 6).

On success, the results list replaces the loading indicator. On failure, the error state message is shown.

### Results list

Each result is rendered as a search result row (described separately as a new component, named `SearchResultRow`, detailed in section 7). Results are displayed in the order returned by the search API. No client-side re-sorting is applied. The first port returns and displays a fixed number of results with no pagination (see lock-now decision in section 7).

For each result, the view checks whether the track identity is already present in the party queue snapshot. If it is, the result row shows the track's current queue vote count alongside the add button in an "already queued" variant state. If it is not, the vote count shown is zero (the track has no queue presence yet).

### Add-to-queue action

Each result row has a single add-to-queue call-to-action. When the participant taps it:

1. The add button on that row enters a pending state immediately (the button is disabled and a brief spinner or label change indicates the action is in flight). CrowdTune-original proposed label while pending: "Adding..." - mark for product copy review.
2. The mutation is issued to the backend.
3. On success: the row's button transitions to a confirmation state for a brief period (CrowdTune-original proposed label: "Added" - mark for product copy review), then either the row disappears from the results list (if the product decision is to remove already-added tracks from results) or the row persists with the "already queued" variant showing the updated vote count. See open question 2 in section 6 for this product decision.
4. On failure: the button returns to the normal add state and an error notification is surfaced (a toast at the page level, not inline on the row). CrowdTune-original proposed toast message: "Could not add track. Please try again." - mark for product copy review.

The add action does not clear the search input or reset the results. The participant can continue searching and adding more tracks without re-typing.

If the participant is not authenticated and the party requires sign-in to add tracks, tapping the add button should open the sign-in flow (via the Neon Auth / Better Auth sign-in modal) rather than issuing the mutation. After sign-in, the view should resume with the previous search intact. See open question 3 in section 6.

### State transitions summary

- Idle (no query): idle prompt shown, input focused.
- Typing (debounce pending): input updates, no search issued yet.
- Searching (request in flight): loading indicator shown.
- Results available: result rows shown.
- No results: no-results message shown.
- Search error: error message shown.
- Add in flight: specific row's button in pending state.
- Add succeeded: specific row updated (removed or marked added).
- Add failed: specific row's button restored, error toast shown.

---

## 4. Side Effects

### Search network call

When the debounced query settles, a request is issued to a search endpoint that returns a list of Spotify tracks matching the query. In the first port, this is represented by a placeholder hook named `useSearchTracks`. The hook accepts the party identifier and the debounced query string. When the query is empty or whitespace-only, the hook returns an idle status with an empty array and makes no network request. The hook's shape matches the pattern established by `usePartyQuery` and `useCreateParty` in the codebase. The actual backend endpoint (a pass-through to Spotify's search API) is a future implementation task; until it exists, the hook returns an empty array and never enters a loading state. This deferred concern should be recorded in `docs/translation-progress.md` under the `party-track-search` section.

### Add-to-queue mutation

The add action is represented by a placeholder hook named `useAddTrack`. The hook accepts the party identifier and the track reference (the provider name and provider identifier pair). Its mutation function returns a resolved promise immediately (no network call yet) when the backend endpoint does not exist. When the endpoint exists, the mutation function will issue a POST to the add-track endpoint and on success invalidate the TanStack Query cache entry for the party queue so the queue view reflects the new track. The hook should be given a clear docblock stating that it is a placeholder pending the backend add-track endpoint. This deferred concern should be recorded in `docs/translation-progress.md` under the `party-track-search` section.

### URL state write

Each time the debounced query changes, the URL is updated via TanStack Router's search-param API so that the query is preserved in browser history. No external storage (local storage, cookies) is written.

### No audio output

This view makes no direct use of the Spotify Web Playback SDK and produces no audio output.

### No Firebase or real-time subscription

The search view does not open any real-time subscription of its own. It reads the party queue snapshot from the TanStack Query cache, which is already subscribed at the party page shell level.

---

## 5. Edge Cases Worth Preserving

- **URL-restored query on back navigation**: if the participant navigates away and returns, the URL query parameter restores the search text and the search fires immediately without waiting for the debounce. The results are re-fetched on mount if the cache has expired, or served from the cache if still fresh.

- **Track already in queue**: a search result that is already in the party queue shows its existing vote count and an "already queued" variant on the add button. The participant can still tap the button to cast an additional vote (which will increment the queue vote count), or the button may be disabled in the "already queued" state depending on the product decision in open question 2. Either way, the row must not show a vote count of zero when the track is already in the queue.

- **Add while search is refreshing**: if the participant adds a track just as a new search result set arrives (because the debounced query settled), the add mutation is tied to the specific track reference and is unaffected by the results list changing underneath it. The mutation completes against the original track regardless of list updates.

- **Rapid successive adds**: if the participant taps multiple result rows in quick succession, each row enters its own pending state independently. The mutations are issued in parallel. Each row manages its own pending and settled state independently. A failure on one row does not affect the pending state of other rows.

- **Empty results after successful search**: the API returned zero matching tracks. The no-results message is shown. The search input retains the query text so the participant can refine it without re-typing.

- **Search API error**: the request failed (network error, rate limit, Spotify token expired on the backend). The error message is shown. The previous results, if any, are cleared. The participant can retry by pressing Enter or modifying the query. The retry follows the same debounce path as a new query.

- **Query cleared via Escape**: the results list is cleared immediately on Escape, returning to the idle prompt. The URL query parameter is also cleared. No network request is cancelled mid-flight by the Escape key (the in-flight request may complete, but its results are discarded because the query state is now empty).

- **Anonymous participant**: if the party's settings permit anonymous participation and the participant is not authenticated, the add-to-queue action requires evaluating the party's sign-in gate policy. See open question 3 in section 6.

- **Party snapshot not yet loaded**: if the party queue snapshot is still loading when the search results arrive, the overlay of queue vote counts on result rows is skipped (all rows show zero or omit the count). Once the snapshot loads, the overlay is applied without re-fetching search results.

- **Very long result list**: the first port caps displayed results at the API's default return count (expected to be 20 tracks; see open question 4). No "load more" pagination is implemented. The result list is a flat vertical list that may scroll within the view's container.

---

## 6. Open Questions for the Implementer

1. **Stale results during re-fetch**: when the participant types a new character after results are displayed, should the previous results remain visible with a loading overlay during the new fetch, or should results be cleared immediately and the loading indicator shown? The source is ambiguous on this. The first-port recommendation is to clear results and show the loading indicator (simpler, no risk of stale results misleading the participant). Confirm with product before shipping.

2. **Row behavior after add succeeds**: should the result row disappear from the list once the track has been added (to signal completion and simplify the visual state), or should it remain with an "already queued" indicator and the live vote count? Disappearing rows can be disorienting if the participant wants to add more tracks from the same search. Staying rows require clear visual differentiation. Product decision required before implementing the success path.

3. **Sign-in gate for add-to-queue**: the Festify source does not check authentication before dispatching the vote/add action. CrowdTune's party settings will include an analog to `allowAnonymousVoting`. If this flag is false, tapping "Add to queue" while unauthenticated should open the sign-in modal and resume the add after sign-in. Confirm the default value for this flag in CrowdTune (recommended default: require sign-in, i.e., flag defaults to false). The implementation of the gate lives in the `useAddTrack` hook or a wrapper around it; the `SearchResultRow` component receives only a callback prop and does not check auth directly.

4. **Result count cap**: the search API (Spotify's search endpoint) returns up to 20 results by default but can be configured with a limit parameter. Confirm with product whether the cap should be 10, 20, or 50 results for the first port. The `useSearchTracks` hook should expose a limit parameter with a sensible default. Record the chosen value in `docs/translation-progress.md`.

5. **Initial / idle state content**: should the idle state (no query entered) show recently-added tracks from the current party, or popular tracks in general, or simply an empty prompt? The source shows only a prompt with no content. The first-port default is an empty prompt (simplest, no additional data fetch). Confirm with product whether a recommendations section is in scope.

---

## 7. Stack Mapping Notes

### Lock-now decisions for this port

**FSD placement - widget, not page**: the search sub-view mounts at a nested route (`/party/$partyId/search`) and performs data fetching via hooks, which suggests it could live at the `pages` layer. However, the party page shell at `apps/web/src/pages/party/` already owns the route-level data coordination for the party session (queue data, playback state, host identity). The search sub-view adds only a search-specific query (via `useSearchTracks`) to that existing data context. It does not introduce a new route-level data boundary. The correct FSD placement is therefore a widget at:

- Component: `apps/web/src/widgets/party-track-search/ui/PartyTrackSearch.tsx`
- Public barrel: `apps/web/src/widgets/party-track-search/index.ts`
- Route binding: a thin route file at `apps/web/src/routes/party.$partyId.search.tsx` that imports `PartyTrackSearch` from `@/widgets/party-track-search` and binds it via `createFileRoute`. No business logic in the route file.

The `PartyTrackSearch` widget owns: the search input state, the debounce logic, the `useSearchTracks` call, and the `useAddTrack` mutation wiring. It does NOT own queue data fetching or party identity; those arrive as props from the party page shell (or from Zustand / TanStack Query that the shell already warms).

**Component shape**: function component, fully controlled where props are concerned. The search query is dual-tracked: local state for the input's current text (so the UI updates on every keystroke) and a URL search parameter for the debounced committed query (so the back button works). Do not collapse these two into one; keeping them separate prevents the URL from being written on every keystroke.

**SearchResultRow is a new component, not PartyTrackRow**: the `PartyTrackRow` component at `@/entities/track/ui/PartyTrackRow.tsx` is designed for queue entries. It carries vote-toggle state, host controls (skip, remove, play/pause, transfer), and a complex action set that is irrelevant in a search context. A search result row needs only: cover image, track title, artist list, an "Add to queue" call-to-action, a pending indicator for the add action, and an optional "already queued" indicator with the existing vote count. This is a different component with a simpler contract. Place it at:

- Component: `apps/web/src/widgets/party-track-search/ui/SearchResultRow.tsx`

This component lives inside the widget slice because it is not an independent entity (it is only meaningful in the context of the search sub-view) and is not a full feature (it owns no mutations directly). It receives all data and callbacks as props. Its props are:

| Prop | Type | Required | Notes |
|---|---|---|---|
| Track metadata | Metadata record or null | Yes | Provides cover image, title, and artist list. Null while metadata is loading. |
| Track reference | Object with provider name and provider identifier fields | Yes | Identifies the track for the add mutation. |
| Current queue vote count | Non-negative integer | Yes | Zero if the track is not in the queue. Shown alongside the add button when the track is already queued. |
| Is already queued | Boolean flag | Yes | True when the track appears in the party queue snapshot. Governs the add button variant. |
| Is add pending | Boolean flag | Yes | True while an add mutation is in flight for this track. Disables the add button and shows the pending indicator. |
| On add callback | Function | Yes | Called with the track reference when the participant taps the add button. No payload beyond the reference. The widget owns the mutation; the row only reports the intent. |

The cover image uses a HeroUI Avatar primitive (query `get_component_docs` on the `heroui-react` MCP for `Avatar` before implementing). The `Avatar.Fallback` slot renders a neutral placeholder when metadata is null. This matches the cover image approach used in `PartyTrackRow`.

**Debounce timing**: locked at 300 ms. Do not make this configurable in the first port.

**Minimum query length**: locked at 1 non-whitespace character. Whitespace-only input is treated as empty. Do not impose a 2- or 3-character minimum.

**Keyboard interactions**: Enter triggers immediate search (cancels debounce). Escape clears input, results, and URL parameter, retains focus on input.

**Pagination**: deferred. The first port displays the raw result array returned by `useSearchTracks` with no "load more" control. Record this deferred concern in `docs/translation-progress.md`.

**Placeholder hooks**: both `useSearchTracks` and `useAddTrack` are placeholder hooks. They live at:

- `apps/web/src/widgets/party-track-search/api/useSearchTracks.ts`
- `apps/web/src/widgets/party-track-search/api/useAddTrack.ts`

`useSearchTracks` signature (in domain terms, no code): accepts a party identifier and a query string; returns a TanStack Query result object with a data field containing an array of objects that each carry a track reference and a Metadata record. When the query is empty or whitespace-only, it returns idle status and an empty array immediately without issuing a network request. When implemented, the query function will call the backend search endpoint which proxies Spotify's track search. The hook must include a docblock stating it is a placeholder pending the backend search endpoint, and the deferred concern must be recorded in `docs/translation-progress.md`.

`useAddTrack` signature (in domain terms, no code): accepts a party identifier; returns a TanStack Query mutation object. The mutation function accepts a track reference and returns a resolved promise immediately (no-op placeholder). When implemented, the mutation function will POST the track reference to the backend add-track endpoint and on settlement invalidate the party queue cache entry. The hook must include a docblock stating it is a placeholder pending the backend add-track endpoint, and the deferred concern must be recorded in `docs/translation-progress.md`. On failure, the mutation's error is caught at the widget level and a toast notification is shown using whatever toast primitive the party page shell exposes (a separate translation task; use a console warning as the interim fallback in the placeholder).

**Add-to-queue underlying action**: in the source, the "add" is a vote cast. In CrowdTune, `useAddTrack` will POST to an endpoint that does the equivalent: if the track is not in the queue, it is added with an initial vote count of one attributed to the current user; if the track is already in the queue, a vote is incremented for it. The distinction between "add" and "vote" is abstracted by the endpoint. The `SearchResultRow` and `PartyTrackSearch` components are unaware of this detail; they call `useAddTrack` and treat it as an add operation.

**URL search parameter**: use TanStack Router's `useSearch` hook for reading the committed query from the URL and TanStack Router's `navigate` for writing it. The committed query is written to the URL only when the debounce settles (not on every keystroke). The local input state drives the visible input text on every keystroke.

**HeroUI primitives**: the implementer must call `list_components` and then `get_component_docs` on the `heroui-react` MCP before implementing. Candidates to query: Input (for the search input field), Avatar (for the cover image with fallback), Button or IconButton (for the add button), Spinner (for the loading state and the pending state on the add button), and any List or ScrollShadow primitive for the result list container. Do not hand-roll any of these from raw Tailwind if HeroUI provides a first-class component.

**Accessibility requirements**:

- The search input must carry an accessible label (a visible label element or an `aria-label` attribute). Proposed label text: "Search for tracks" - mark for product copy review.
- The results list must have a region role or a list role so screen reader users know it is a navigable list.
- Each `SearchResultRow` must have an accessible name combining the track title and artist name (for example, set on the row's wrapping element via `aria-label`). When metadata is null, the accessible name should fall back to "Loading track" or equivalent.
- The add button in each row must have an accessible label that names the track and the intent: proposed format "Add [track title] by [artist] to queue" - mark for product copy review. While the add is pending, the accessible label should update to "Adding [track title]..." so screen reader users receive feedback without a visible spinner alone.
- When the add succeeds and the row transitions to an "already added" or disappears, screen reader users must receive a live-region announcement. A single `aria-live="polite"` region at the widget level (not per-row) should announce the outcome. Proposed announcement: "[Track title] added to queue." - mark for product copy review.
- Keyboard focus must remain on the search input after a search is triggered (Enter or debounce settle). Focus must not jump to the results list automatically; the participant uses Tab to move to the first result row if desired.
- The Escape key handler must not interfere with any browser defaults (closing modals, etc.). Since the search input is a text field, Escape has no default browser behavior in a text context, so the handler is safe to attach without calling `preventDefault()`.
- The loading state must suppress the results list from the accessibility tree (use `aria-busy` on the results region while loading, or replace the region content with the spinner and a visually hidden "Searching..." text).

### Polymer and web-component concepts not carried forward

The source registers a custom HTML element using a framework-specific connect function that wraps a shared base element with a search-specific state selector. None of that applies in CrowdTune. The search sub-view is a plain React function component (the widget) that imports a plain React function component (the row). There is no custom element registration, no shadow DOM, no shared base class inheritance, no lit-html template literals, and no framework-specific state-connection wrapper.

### Dependency summary

- `Track`, `Metadata`, `TrackReference` entity types from `@/entities/track/model/types` (already shipped).
- `trackIdentityKey` from `@/entities/track/lib/identity` (used to check whether a search result is already in the queue snapshot by comparing against queue keys).
- `formatArtists` from `@/entities/track/lib/labels` (used by `SearchResultRow` to produce the artist display string from the Metadata record's artist list).
- TanStack Router `useParams` (for `partyId`), `useSearch` (for the committed query URL param), and `navigate` (for writing the URL param on debounce settle).
- TanStack Query's `useQuery` and `useMutation` (via the two placeholder hooks).
- `@/shared/auth` (for authentication state, to evaluate the sign-in gate policy).
- `@/shared/api/client.ts` (used by `useSearchTracks` and `useAddTrack` when the backend endpoints land; not called directly by the widget or row components).
- HeroUI Input, Avatar, Button, Spinner (confirm exact API via `heroui-react` MCP before implementing).
- Does NOT import from `@/entities/track/ui/PartyTrackRow` - the queue row and the search result row are separate components with different contracts.
- Does NOT import from `@/widgets/queue-drawer`, `@/widgets/party-queue`, or `@/widgets/playback-progress-bar` - the search sub-view is sibling to the queue view within the party page shell's outlet, not nested inside them.
- Depends on a toast notification mechanism at the party page shell level for add-failure feedback. The exact API for this depends on a separate translation task; the placeholder is a `console.warn` call.
