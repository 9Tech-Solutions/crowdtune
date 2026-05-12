# Spec: Party Search Results Container View

Translation source: Festify `views/party-search.ts`
Translation date: 2026-05-12
Status: Thirteenth UI port. This is the search results container view - the parent shell that displays the loading/error/results states for the search sub-view. Its role is distinct from `views/party-track-search.ts`, which was the row-level search result component.

---

## 0. Relationship to Existing PartyTrackSearch Port

### What `views/party-search.ts` actually does in Festify

In the Festify codebase, `views/party-search.ts` is the top-level container component for the party's search sub-view. It does two things:

1. It reads three pieces of state from the Redux store: the in-progress flag for a search request, the error from the most recent failed search, and the sorted list of tracks returned by the most recent successful search.
2. It renders the overall layout for the search result screen, choosing between three possible content states: a loading spinner (when a search is in flight), an error message (when the last search failed), or a list of track rows (when results are available or the state is idle). The track rows are rendered using the `party-track-search` custom element, which is a separate file (`views/party-track-search.ts`) that handles each individual row's data binding and add-to-queue action.

In Festify's architecture, `views/party-search.ts` is the orchestrating shell, and `views/party-track-search.ts` is the row template. They are separate files with a parent-child relationship: the search container renders N instances of the track row element.

### What the existing CrowdTune PartyTrackSearch widget covers

The existing CrowdTune widget at `apps/web/src/widgets/party-track-search/ui/PartyTrackSearch.tsx` (shipped at commit ef69bdb) already covers substantially more ground than either Festify file alone. It combines:

- The search input field (which in Festify lives at yet another level, in the party page shell or the route handler that mounts the search view - not in either of these two files).
- The debounced query-to-URL write behavior.
- The loading/error/idle/results state rendering (the behavior that `views/party-search.ts` orchestrates).
- The per-row rendering using `SearchResultRow` (the behavior that `views/party-track-search.ts` handles at the row level).
- The add-to-queue action flow including pending states and accessibility announcements.

CrowdTune collapsed what Festify split into two files plus a host page shell into a single widget component. This was the correct architectural decision for CrowdTune because:

- Festify's separation was driven by its web-component and custom-element constraint (each file defines one custom element). React has no analogous constraint.
- The state that `views/party-search.ts` reads (loading flag, error, sorted track list) is produced by the same data layer that `PartyTrackSearch` already owns via `useSearchTracks`.
- Keeping the container and the row template in separate components in CrowdTune would add indirection with no benefit, since the container's only job is selecting between three rendering states that `PartyTrackSearch` already handles inline.

### Overlap analysis

Every behavior from `views/party-search.ts` is already present in the CrowdTune `PartyTrackSearch` widget:

| Festify behavior in `views/party-search.ts` | CrowdTune `PartyTrackSearch` coverage |
|---|---|
| Show loading spinner while search is in flight | Covered: `isLoading` branch renders `<Spinner>` |
| Show error message when search fails | Covered: `isError` branch renders error paragraph |
| Show list of track rows when results available | Covered: `hasResults` branch renders `<ul>` of `SearchResultRow` |
| Render zero rows and no indicator when idle (no error, not loading, no results) | Covered: idle branch renders idle-state prompt paragraph |
| Each row receives a compound track identifier (provider + provider ID) | Covered: `SearchResultRow` receives `result.trackRef` which carries both fields |
| Top padding on the first row | Covered: outer container has `pt-4` class applied |

There are no behaviors in `views/party-search.ts` that are missing from the existing CrowdTune `PartyTrackSearch` widget.

### New or different behavior compared to existing port

One minor behavioral nuance in `views/party-search.ts` that the existing port handles differently but equivalently:

- Festify's idle state (no loading, no error, zero results) renders nothing at all - no message. CrowdTune's idle state renders a prompt message ("Search for songs to add to the queue."). This is a CrowdTune-original improvement and should be kept.
- Festify's no-results state (search completed with zero matches) also renders nothing - no message. CrowdTune renders a no-results message. Same assessment: CrowdTune improvement, keep it.
- Festify's error state shows an emoji, a heading, and a subheading. CrowdTune shows a single paragraph. CrowdTune's version is simpler and sufficient; no change needed.
- Festify applies `queueStyles` (shared CSS from the queue view) to the search container, which provides consistent list-item and track-row styling. In CrowdTune this is handled by Tailwind utilities and HeroUI primitives on `SearchResultRow` - no shared style import is needed.

### Recommendation: Option (b) - the existing PartyTrackSearch port already covers this file

The existing `PartyTrackSearch` widget fully covers all behaviors specified in `views/party-search.ts`. No new widget is needed. The translation-progress.md entry for `views/party-search.ts` should be marked as "covered by the PartyTrackSearch port (commit ef69bdb); no separate implementation required."

The naming is not a problem: `PartyTrackSearch` is named after its row behavior (which is the more user-facing identity) rather than its container role. The widget correctly collapses both layers. No rename or restructure is warranted.

The implementer should update `docs/translation-progress.md` to log this file as translated and resolved-by-existing-port, citing the analysis above.

---

## 1. Purpose

This component solves the problem of displaying the current state of a track search to party participants. It acts as a status-aware container that switches between a loading view, an error view, and a populated results view depending on what the search request has returned so far. It ensures that participants always see clear feedback about whether a search is working, has failed, or has produced results - rather than seeing a blank screen or stale results during a slow network round trip.

In the CrowdTune port this responsibility is handled inline within the `PartyTrackSearch` widget. This spec documents the container layer for completeness and as the audit trail confirming the existing port is sufficient.

---

## 2. Public Contract

### 2a. Inputs

The container reads the following from shared application state. It accepts no configuration props of its own in the Festify architecture; all inputs arrive via the state connection.

| Input | Type | Required | Description and valid values |
|---|---|---|---|
| Search in-progress flag | Boolean | Yes | True while a search request is outstanding. Drives the loading indicator. False when no search has been started or when the last request has settled (either successfully or with an error). |
| Search error | Error record or null | Yes | Non-null when the most recent search request ended in a failure. Null when no search has been attempted or when the last search succeeded. The error object carries a message but its text is not displayed verbatim - the error state renders a fixed user-facing message regardless of error content. |
| Sorted search result tracks | Ordered list of track records | Yes | The list of tracks returned by the most recent successful search, sorted by a relevance or popularity criterion defined in the track selector layer. Empty list is valid and produces the idle/empty state. Each track record carries at minimum a provider name and a provider-specific identifier. |

### 2b. Outputs, events, and responses

The container emits no domain events. Its visible outputs are:

- A centered loading spinner when a search is in flight.
- A centered error heading and subheading when the last search failed. The error copy in Festify is "Oh, no!" as the heading and "An error occurred while searching. Please try again." as the subheading. In CrowdTune this is replaced with CrowdTune-original copy - see section 3.
- A vertically stacked list of track row components when results are available.
- No visible content when the state is idle (no search in flight, no error, no results). The CrowdTune port improves on this by showing a prompt message in the idle state.

### 2c. State observed (read from shared application state)

- **Search loading flag**: whether the search data layer currently has a pending request. In CrowdTune this is the `isLoading` field from the `useSearchTracks` TanStack Query hook.
- **Search error**: the error from the most recent failed search request. In CrowdTune this is the `isError` field from the same hook (the error detail is not surfaced to the component; the flag alone drives the error state).
- **Search results**: the list of track records matching the most recent query. In CrowdTune this is the `data` field from `useSearchTracks`, defaulting to an empty array. The sorted order is determined by the hook's data layer (or the order returned by the backend search endpoint), not by client-side sorting logic in the container itself.

### 2d. State mutated

The container itself mutates no state. All state mutations are triggered by the row components it hosts (the add-to-queue action per row). The container is a read-only rendering layer for the search state.

---

## 3. Behavior

### Loading state

When a search request is in flight, the container renders a single centered loading indicator in place of the results list. In Festify this is a spinner web component. In CrowdTune the HeroUI `Spinner` primitive is used. The loading indicator is centered both horizontally and vertically within the container's available space. The rest of the search results area is suppressed while the spinner is visible - previous results are not kept visible behind a loading overlay.

### Error state

When the most recent search ended in a failure and no search is currently in flight, the container renders a centered error message. The Festify copy is "Oh, no!" and "An error occurred while searching. Please try again." The CrowdTune port uses its own copy - the existing implementation renders "Search is unavailable right now. Please try again." This CrowdTune-original copy is acceptable and should be kept; mark for product copy review.

The error state renders instead of the results list. No partial results from before the error are shown. The error indicator is a non-interactive display only - the participant retries by modifying the search query in the input field above, not by tapping a retry button in the container.

### Results state

When a search has completed successfully and the result list is non-empty, the container renders one track row per result in document order. Each row is a fully independent component that receives the track's compound identifier as its primary input. The container does not paginate or truncate the list; all returned results are rendered.

The first row has additional top spacing (padding) applied so that the top of the result list does not visually collide with the search input above it.

### Idle state (empty results, no error, not loading)

When no search is in flight, no error has occurred, and the result list is empty (either because no search has been run yet or because the last search returned zero tracks), the container renders nothing in Festify - a blank area. In CrowdTune the idle state is improved: a prompt message invites the participant to begin typing. In the no-results-found case (a search was run but returned zero matches), a different message explains that no tracks matched. Both messages are CrowdTune-original and should be marked for product copy review.

### State priority order

The rendering priority when multiple states might appear active is:

1. If a search is in flight, show the loading state regardless of any prior error or result data.
2. Otherwise, if an error is present, show the error state.
3. Otherwise, if results are available (non-empty list), show the results list.
4. Otherwise, show the idle/empty state.

This priority order ensures that a new search always clears the error state (by entering loading), and that a search that recovers from an error (producing results) correctly shows results rather than the error.

---

## 4. Side Effects

The container layer itself produces no side effects. It is a pure rendering function of the three input state values.

The side effects for the search (network calls to the Spotify track search endpoint via the backend) and for the add-to-queue action (POST to the add-track endpoint) originate in the row components and the data hooks. These are documented in the `views-party-track-search.spec.md` spec, which covers the full end-to-end behavior of the search sub-view including the hooks.

In CrowdTune, since the container is collapsed into `PartyTrackSearch`, the side effects are unified in that single widget.

---

## 5. Edge Cases Worth Preserving

- **Transition from error to loading**: if the participant modifies the query after a failed search, the loading state should replace the error message immediately when the new request fires. The error state must not persist "underneath" the loading spinner.

- **Empty results versus idle**: the container renders the same blank area in Festify for both zero-results-after-search and no-search-yet states. CrowdTune correctly differentiates these by examining whether a committed query string exists. If the query is non-empty but results came back empty, the no-results message is shown. If the query is empty (no search issued), the idle prompt is shown. This distinction is already implemented correctly in `PartyTrackSearch` and must be preserved.

- **Single result**: a results list with exactly one track is valid and must render that one row with the same top spacing as a multi-result list. No minimum result count should be enforced.

- **Error after results**: if the participant performed a successful search (results shown), then ran a new search that failed, the error state replaces the previous results. The previous results are not kept in view. This matches the state priority order in section 3.

- **Rapid successive searches**: if multiple search requests are issued in quick succession (via the debounce path), only the most recent result or error is reflected. Stale responses from earlier requests are discarded. This is handled by TanStack Query's automatic cancellation of superseded queries; the container itself has no special handling needed.

---

## 6. Open Questions for the Implementer

1. **No new implementation needed**: because recommendation (b) applies and the existing `PartyTrackSearch` widget already covers this file's entire behavior, there are no implementation open questions specific to this spec. The only action required is updating `docs/translation-progress.md`.

2. **Confirm idle-vs-no-results differentiation is tested**: the existing `PartyTrackSearch` widget distinguishes between "no query entered" (idle) and "query entered, zero results returned" (no-results) using the `isIdle` flag derived from `committedQuery.trim().length === 0`. A unit test should verify that these two states render different messages. If no such test exists yet, add one as part of closing this translation task.

3. **Sorted results**: Festify applies a `sortedTracksFactory` selector to the raw search result list before rendering it. The sort criterion is defined in the `selectors/track` module (a separate translation task). In CrowdTune's first port, `useSearchTracks` returns results in the order the backend delivers them. Once the backend search endpoint is wired, confirm whether client-side re-sorting is needed, or whether the backend endpoint returns results in the correct relevance order. If client-side sorting is required, it belongs in the `useSearchTracks` hook's `select` option, not in the container component. Record this decision in `docs/translation-progress.md`.

4. **Shared queue styles**: Festify's search container imports `queueStyles` from the queue view file. This shared stylesheet provides consistent list spacing, border treatment, and icon sizing used across queue rows and search result rows. In CrowdTune, this shared styling comes from HeroUI primitives and Tailwind utilities applied at the `SearchResultRow` level. Verify that the visual result is consistent between the queue row (`PartyTrackRow`) and the search result row (`SearchResultRow`) - they should have the same vertical rhythm. If inconsistency is found during visual QA, the fix belongs in `SearchResultRow`'s layout classes.

---

## 7. Stack Mapping Notes

### This file does not produce a new CrowdTune artifact

Because recommendation (b) applies, no new file should be created at `apps/web/src/widgets/party-search/`. The behavior lives in the existing `PartyTrackSearch` widget at `apps/web/src/widgets/party-track-search/`.

### Polymer architecture patterns not carried forward

In Festify, this file registers a custom HTML element named `party-search` using a framework-specific connect helper that wraps the view function with a Redux state subscription. The custom element is then used by the party page shell as a standard HTML tag. React has no equivalent concept - components are imported directly. In CrowdTune, the equivalent of element registration is simply exporting a function component from the widget barrel file.

The `party-track-search` custom element that this container instantiates per-result is translated as the `SearchResultRow` component already implemented at `apps/web/src/widgets/party-track-search/ui/SearchResultRow.tsx`.

### Redux state connection pattern

Festify uses a framework-specific connect function to bind the Redux store's search-related state slices to the component's props. In CrowdTune this entire pattern is replaced by the TanStack Query hook `useSearchTracks`, which provides `data`, `isLoading`, and `isError` directly as named values. No explicit state connection or `mapStateToProps` equivalent is needed in the React component.

### Sorted track selector

Festify applies a memoized sorted-tracks factory selector before passing results to the view. The sort factory and its dependency on a track selector abstraction are described in `docs/specs/selectors-track.spec.md` (a separate translation task). In CrowdTune the equivalent is the `select` option on the `useSearchTracks` TanStack Query hook. Until the sort criterion is confirmed, the hook returns results in backend order.

### Dependency summary

Since no new widget is created, no new dependencies are introduced. The existing `PartyTrackSearch` widget's dependency list (documented in `docs/specs/views-party-track-search.spec.md` section 7) is complete and covers this file's translated behavior.

- Depends on `views/party-track-search.ts` behavior - already translated as `SearchResultRow` at `apps/web/src/widgets/party-track-search/ui/SearchResultRow.tsx`.
- Depends on `selectors/track.ts` sort behavior - documented in `docs/specs/selectors-track.spec.md`, not yet implemented; the first port skips client-side sorting.
- Depends on `state.ts` shape for `partyView.searchResult`, `partyView.searchError`, `partyView.searchInProgress` - covered by the TanStack Query integration in `useSearchTracks`.
