# Spec: Playlist Selectors

## 1. Purpose

This module provides the derived data a host needs when browsing and searching through the Spotify playlists available for designation as a fallback source. Its job is threefold: expose the raw list of playlists the authenticated user has access to, expose the text the host has typed into the playlist-search input, and compute a filtered sub-list that contains only playlists whose names contain the search string. The filtered list is what the settings UI renders; the raw list and the query string are intermediate values that feed into that computation but may also be consumed independently.

---

## 2. Public Contract

### 2a. User Playlist List Accessor

A function that reads the list of playlists belonging to the current user from application state and returns it as-is.

- State observed: the playlists array stored under the user credentials slice of application state. This is the list that was populated when the host authorized with Spotify and the backend fetched that user's playlists.
- Output: an array of Playlist objects (each carrying a display name, a PlaylistReference, and a track count). The array may be empty if the user has no playlists or if the load has not yet completed. The function does not distinguish between "empty because none exist" and "empty because still loading" - callers must use a separate loading-state indicator for that distinction.
- No inputs beyond application state. No state mutated. Synchronous.

### 2b. Playlist Search Query Accessor

A function that reads the current text in the playlist-search input from the settings-view state slice.

- State observed: the playlist search query string stored in the settings-view transient state. This string is updated on every keystroke by the host in the playlist-search field.
- Output: a string. May be an empty string when the host has not typed anything, has cleared the field, or the settings view has not been initialized.
- No inputs beyond application state. No state mutated. Synchronous.

### 2c. Filtered Playlist List Derivation

A derived function that combines the user playlist list and the search query to produce the subset of playlists the host should see in the settings UI at any given moment.

- State observed: the user playlist list (from 2a) and the playlist search query (from 2b).
- Output: an array of Playlist objects. When the search query is absent or an empty string, the output is the entire user playlist list unchanged. When the search query is a non-empty string, the output is those playlists from the list whose display names contain the search query as a case-insensitive substring. The order of items in the output matches the order of items in the source list; no reordering is applied.
- No state mutated. Synchronous. Deterministic given the same list and query.

---

## 3. Behavior

### User playlist list access

This is a direct field read with no transformation. The function navigates to the user credentials slice of state and returns the playlists array stored there. The array is whatever was stored by the last successful playlist-fetch operation. If that field has never been set, it returns whatever default value the state was initialized with (expected to be an empty array). The function does not guard against null or undefined at the array level; the state initializer is responsible for ensuring the field is always an array.

### Search query access

This is a direct field read with no transformation. The function reads the string from the settings-view state slice. If the view slice is freshly initialized and the host has not interacted with the search field, the value is an empty string (the default for that field, as described in the state spec under Settings View State).

### Filtered list derivation

The derivation proceeds in two branches:

If the search query is falsy (an empty string, null, or undefined), the derivation short-circuits and returns the full playlist list without any allocation or iteration. This makes the zero-query case free of unnecessary work.

If the search query is a non-empty string, the derivation converts the query to lowercase and then tests each playlist in the list. A playlist passes the filter when its display name, also converted to lowercase, contains the lowercased query as a substring anywhere in the name (not just a prefix). Both the name and the query are lowercased independently before the substring test, so the comparison is fully case-insensitive. Playlists that do not pass this test are excluded from the output. The output is a new array containing only the passing playlists in their original order.

The substring match is a simple inclusion check with no tokenization, ranking, or fuzzy matching. A playlist named "My Chill Vibes" matches a query of "chi", "chil", "chill", "vib", "CHILL", and "MY CH", but does not match "myc" or "vchill" (because neither appears as a contiguous substring of the lowercased name).

The filtering does not read any property of the playlist other than its display name. The track count and the PlaylistReference fields are not consulted during filtering.

---

## 4. Side Effects

This module contains no network calls, storage writes, audio output, or SDK interactions. All three functions are pure transformations of data already present in application state. The filtered playlist list influences which playlist rows the settings UI renders, but the selector itself initiates nothing.

---

## 5. Edge Cases Worth Preserving

- No playlists loaded yet: the user playlist list accessor returns an empty array. The filtered derivation also returns an empty array for any query. No error is thrown.
- Query is an empty string: the filtered derivation returns the full list without any filtering step. This is important for the initial state where the search field is blank - the host sees all their playlists immediately.
- Query is whitespace only (e.g. a single space): the derivation treats this as a non-empty string and filters. A playlist whose name contains a space (most do) will match; one whose name has no spaces will not. This behavior is inherited from the reference implementation. The implementer may want to add a trim step - see section 6.
- Query matches no playlists: the output is an empty array. The UI layer is responsible for showing a "no results" message; this function returns an empty array in that case, not null.
- Query matches all playlists: the output is the full list. The derivation is equivalent to the no-query branch in effect, but it still allocates a new array via the filter operation.
- Playlist whose name is an empty string: the empty-string name will match only if the query is also an empty string (which bypasses filtering entirely). For any non-empty query the empty-name playlist will not match. This is an unlikely data case but the behavior is consistent.
- Very long playlist list: the filter iterates every element linearly. There is no pagination or windowing in this selector; that is a rendering concern for the component. If the Spotify API returns hundreds of playlists, the selector filters all of them on every keystroke. See section 6 for debouncing notes.
- Track count of zero on a playlist: the track count is not consulted by any selector in this file. A playlist with zero tracks passes the name filter just like any other. Whether to hide or grey out zero-track playlists is a UI-layer decision, not a selector decision.

---

## 6. Open Questions for the Implementer

1. **Whether any selector here requires the User slice (and whether that User slice is settled).** The user playlist list accessor reads from the user credentials slice, which in Festify held the Spotify-authorized user's playlist data. In our stack the User slice is deferred until the Neon Auth shape is settled. The playlist list will come from a Spotify API call made on behalf of the authenticated user. The implementer must decide where this list lives in our state model: as a field on the Neon Auth user object, as a separate Zustand store slice for Spotify-specific data, or as a TanStack Query cached result. If it lives in TanStack Query cache rather than a Zustand slice, neither accessor function (2a and 2b) is needed in our stack in their current form - the filtered derivation (2c) becomes a plain function accepting a Playlist array and a query string directly. Proposed simplified signatures: `filterPlaylists(playlists: Playlist[], query: string) => Playlist[]`. Flag for review before implementing the settings UI.

2. **Whether trackCount ordering is stable and whether a secondary sort is needed.** The playlist selectors in this file do not sort the playlist list at all - they return playlists in whatever order they arrived from Spotify. However, the host UI will likely want to display playlists sorted by some criterion (alphabetical name, track count descending, or the Spotify API's default ordering). The reference implementation appears to rely on Spotify's API order. For CrowdTune, decide at the settings-screen component spec whether to sort the filtered list by name alphabetically (stable, predictable), by track count descending (useful for host to find large fallback playlists quickly), or to preserve Spotify's order. If sorting by track count with equal counts possible, a secondary sort by name alphabetically is recommended for determinism. This decision belongs in the component spec or the query layer, not in the selector function itself.

3. **Whether the Festify-style "loaded vs loading" tri-state is needed or whether TanStack Query's isLoading / isFetching on the call site is sufficient.** The user playlist list accessor in the reference returns whatever is in state, with no loading flag attached. The settings-view state slice (as described in state.spec.md) does carry a separate boolean for "playlist search or load request is in flight" and a separate error object. In our stack, TanStack Query provides isLoading, isFetching, isError, and error as first-class fields on the query result. The filtered playlist list function should not need to embed a loading flag in its output. The component consuming filtered playlists should use TanStack Query's own status fields to show a spinner or error state. No tri-state is needed inside the selector itself.

4. **Whether whitespace-only queries should be trimmed before filtering.** The reference implementation does not trim the query before lowercasing and comparing. A host who accidentally types a trailing space will get a filtered list that matches only playlists with spaces in their names. In practice this is unlikely to matter but it could confuse hosts. The implementer should decide at implementation time whether to add a trim step to the query string before the substring test, and document the decision. Trimming is the safer default.

5. **Whether any selector emits a display string that should be rewritten as CrowdTune-original copy.** This file contains no display strings. The playlist display name is data from Spotify, not a string defined in this file. No copy rewrite is needed here.

6. **Debouncing the search query.** The filtered derivation runs on every state update that includes a changed query string. If the query is stored in Zustand and updated on every keystroke, the filter runs synchronously on every character. For a small playlist list (fewer than 50 items) this is negligible. For a large list the implementer should consider debouncing the query update (for example, waiting 150-300 ms after the last keystroke before committing the query to state), so the filter does not run on every intermediate character. This is a UX and performance decision for the component layer, not for this selector function.

7. **Identity / composite key semantics for playlists (PlaylistReference).** The playlist identity key in the reference implementation is a composite of provider name, provider-assigned playlist ID, and the Spotify user ID of the playlist owner (matching the PlaylistReference shape described in state.spec.md). The selectors in this file do not form or use this composite key - they filter only by display name. However, the surrounding playlist-selection flow (choosing a fallback playlist and writing it to the party record) will need to produce and compare PlaylistReference values. The implementer should confirm that the Playlist objects arriving from the Spotify API carry all three fields (provider, playlist ID, owner user ID) and that the PlaylistReference type in our entity layer includes the owner user ID field. If the Spotify API response for a user's own playlists omits the owner ID for playlists they own (returning only their own ID implicitly), the fetch layer must inject the authenticated user's Spotify user ID as the owner field before storing the Playlist objects.

---

## 7. Stack Mapping Notes

- This module maps to `apps/web/src/entities/playlist/lib/` in our FSD structure. Given that there are only three functions (one of which is a straightforward composition of the other two), they should live in a single file, for example `apps/web/src/entities/playlist/lib/playlist-selectors.ts`, exported from the `@/entities/playlist` barrel.

- Each accessor in the reference reads from a Redux state slice. In our stack there is no Redux. The accessor functions (2a and 2b) become unnecessary if the playlist list comes from a TanStack Query result and the search query is local component state (or a Zustand field). The only function that survives in our stack as a standalone utility is the filtered list derivation (2c), which becomes a plain function accepting a Playlist array and a query string. Proposed signature: `filterPlaylists(playlists: Playlist[], query: string) => Playlist[]`. This function has no dependency on any store or context, making it trivially testable.

- If the search query is managed as local React state inside the settings component (the most natural approach in a non-Redux stack), no Zustand slice is needed for it. If the query needs to survive navigation or be readable from outside the component tree, it would go into a Zustand settings slice. Flag for the component spec.

- Memoization: the reference implementation wraps the filtered derivation with reselect's createSelector for memoization. In our stack, if filterPlaylists is called from a React component, React.useMemo with the playlists array and query string as dependencies is sufficient. Alternatively, the filtering can run inline with no memoization since the list is expected to be small (hundreds at most). Only memoize if profiling shows a problem.

- The Playlist and PlaylistReference types must be imported from `@/entities/playlist` (specifically the model sub-directory). The filterPlaylists function must not import from `@/entities/track` or `@/entities/party` since that would be a same-layer cross-slice violation. The function needs only the Playlist type, which is self-contained.

- Cross-slice note: if a selector in a different entity (for example, a party-level selector that needs to identify the currently designated fallback playlist) needs to call filterPlaylists or work with Playlist objects, it should accept pre-filtered Playlist arrays as parameters rather than importing from `@/entities/playlist` directly. Same-layer cross-slice imports are forbidden; prefer plain data passing.

- The settings view that renders the playlist list sits in a feature or page layer that imports from `@/entities/playlist`. That import direction (page/feature down to entity) is valid under FSD rules.

- Depends on the Playlist entity type - already described in state.spec.md and confirmed available. No separate translation task needed for the type itself.

- Depends on the settings-view state shape (specifically the playlist search query field) - also described in state.spec.md. If this field lives in a Zustand slice rather than local component state, that slice must be defined before this function can be fully wired.
