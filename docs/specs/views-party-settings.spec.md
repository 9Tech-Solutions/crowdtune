# Spec: Party Settings Sub-View

Translation source: Festify `views/party-settings.ts`
Translation date: 2026-05-11
Status: Eighth UI port. This is the host-only settings sub-view of the party page. It mounts at `/party/$partyId/settings` and is reached via the QueueDrawer's "Settings" navigation link, which is visible only when the current user is the party host.

---

## 1. Purpose

This view gives the host of a live music session a panel in which to adjust how their party runs. The host can change the party's display name, set a maximum track length so guests cannot add very long songs, compose a short message shown on TV screens or large displays, toggle whether guests must sign in before voting, toggle whether tracks with explicit lyrics can be added, and toggle whether the search panel stays open so guests can add multiple tracks quickly. The host can also flush the current queue so the party starts fresh without the tracks already submitted. Separately, the host can pick a fallback Spotify playlist, which the backend uses to continue playback when the queue runs empty; selecting and inserting a fallback playlist is a separate action from the general settings toggles and requires the host to have connected their Spotify account.

The view is strictly host-gated. Guests who somehow navigate to the route see an unauthorized message. No editing affordances are presented to non-hosts.

---

## 2. Public Contract

### 2a. Inputs

The settings sub-view receives or derives the following from its environment:

| Input | Type | Required | Description and valid values |
|---|---|---|---|
| Party identifier | String | Yes | The unique short identifier for the current party session, read from the URL path parameter by the widget itself via TanStack Router's `useParams` hook. NOT passed as a React prop from the route file. The route file at `src/routes/party.$partyId.settings.tsx` is a thin binding only. Never null while this view is mounted. |
| Current party data | Party record or null | Yes | Provides the current party name, the `createdBy` field (for host-gating), and the current `PartySettings` object (all five editable fields: `allowAnonymousVoting`, `allowExplicitTracks`, `allowMultipleVotesPerSearch`, `tvDisplayText`, `maxTrackLengthMinutes`). Read from the TanStack Query cache already warmed by the party page shell. Null while the party is loading. |
| Authenticated user identity | String or null | Yes | The current user's identifier from the session (the JWT sub claim), read from `@/shared/auth`. Used to determine whether the current user is the host by comparing against `party.createdBy`. |
| Host's Spotify playlist list | List of Playlist records or null | Yes (for the playlist picker panel) | The list of playlists owned by the host in Spotify. Null when not yet fetched or when the host has not connected a Spotify account. Each record carries at minimum a playlist identifier, a display name, and optionally a cover image URL. Fetched by the `useHostPlaylists` placeholder hook. |
| Playlist search query | String | Yes (may be empty) | The text the host has entered in the playlist search input to filter the displayed playlist list. Held in local component state. Empty string means no filter is applied and all playlists are shown. |
| Spotify account connection status | Boolean | Yes | Whether the host has connected their Spotify account to their CrowdTune session. When false, the playlist picker panel is replaced by a Spotify sign-in prompt. Derived from the host's session data via `@/shared/auth` or a separate flag on the party query response. |
| Playlist insertion in-progress flag | Boolean | Yes | Whether a playlist insertion is currently being processed by the backend. Used to disable the insert and shuffle-insert buttons while the operation is in flight. Provided by the `useInsertPlaylist` mutation state. |
| Queue flush in-progress flag | Boolean | Yes | Whether a queue flush operation is currently being processed. Used to disable the flush button while the operation is in flight. Provided by the `useFlushQueue` mutation state. |
| Spotify authorization in-progress flag | Boolean | Yes | Whether the Spotify OAuth redirect/popup flow has been triggered and has not yet resolved. Used to replace the sign-in button with a spinner in the sign-in prompt panel. Derived from local state or from the auth session's pending state. |

### 2b. Outputs, events, and responses

The sub-view itself emits no domain events outward. All mutations are expressed through placeholder hooks. Visible outputs to the user are:

- A rendered two-panel layout: a "General Settings" panel on the left (or top on narrow screens) and a "Fallback Playlist" panel on the right (or bottom).
- Text inputs for the party name and maximum track length and TV display text, reflecting the current saved values.
- Three toggle controls reflecting the current saved values for `allowAnonymousVoting`, `allowExplicitTracks`, and `allowMultipleVotesPerSearch`.
- A "Flush queue" button that removes all non-playing tracks from the queue.
- The playlist picker panel (when Spotify is connected): a search filter input, a loading spinner while playlists are fetched, and a scrollable list of playlist rows each with an insert and a shuffle-insert action.
- The Spotify sign-in prompt (when Spotify is not connected): a Spotify sign-in button or a spinner if authorization is already in progress.
- Error notifications (toasts) when a save, flush, or insert fails.
- Disabled controls during in-flight operations.

### 2c. State observed (read from shared application state)

- **Party data**: the full Party record including `name`, `createdBy`, and the nested `PartySettings` object. Read from the TanStack Query cache keyed by the party identifier. Already warmed by the party page shell.
- **Authentication state**: the current user's identifier, sign-in status, and Spotify connection status. Read from `@/shared/auth`. The host's identity is confirmed by matching the user's identifier against `party.createdBy`.
- **Host playlist list**: the list of the host's Spotify playlists, keyed by the party identifier and the host's user identifier. Read from the TanStack Query cache populated by `useHostPlaylists`. Only fetched when the host navigates to this view.
- **Mutation statuses**: the pending and error states of `useUpdatePartySettings`, `useFlushQueue`, and `useInsertPlaylist`. Used to drive disabled states and loading indicators on controls.

### 2d. State mutated

- **Party name and settings**: when any of the five editable fields changes and the host saves (or in the auto-save path, when the control value changes), the party record in the backend is updated. The TanStack Query cache entry for the party is invalidated or updated after the mutation settles.
- **Party queue**: the flush action removes all tracks except the currently playing track from the queue. The TanStack Query cache entry for the queue is invalidated after the flush settles.
- **Fallback playlist queue insertion**: inserting a playlist (ordered or shuffled) appends the playlist's tracks to the current party queue. The TanStack Query cache entry for the queue is invalidated after the insert settles.
- **Spotify auth session**: triggering Spotify sign-in initiates an OAuth flow. Completion writes Spotify credentials to the auth session. This mutation is external to CrowdTune's own API.

---

## 3. Behavior

### Host-gate check

When the view mounts, it checks whether the authenticated user's identifier matches `party.createdBy`. If the match fails (the user is not the host, or the party record is not yet loaded), the view renders an unauthorized message and no editing affordances. The check uses the already-cached party data; it does not issue a separate permission check to the backend.

While the party record is loading (null), the view renders a full-panel loading indicator rather than a blank panel or a flash of unauthorized content.

### Layout

On wide screens (roughly 1024 px and above), the two panels sit side by side at equal widths: the General Settings panel on the left, the Fallback Playlist panel on the right. On narrower screens, the panels stack vertically with the General Settings panel above.

### General Settings panel

The panel contains, in order:

A section heading. CrowdTune-original proposed heading: "General Settings" - mark for product copy review.

A text input for the party name. The field shows the current party name. The host edits it freely. Validation: the party name must not be empty and must not exceed a reasonable character limit (recommended 100 characters; implementer should confirm with product before coding). CrowdTune-original proposed label: "Party Name" - mark for product copy review. CrowdTune-original proposed placeholder text: "My Party" - mark for product copy review. CrowdTune-original proposed validation message for empty: "Party name is required." - mark for product copy review.

A number input for the maximum track length in whole minutes. The field shows the current value or is blank when there is no limit. The host may enter any positive integer or clear the field (blank means no limit). Non-numeric input is not accepted by the input. CrowdTune-original proposed label: "Maximum Track Length (minutes)" - mark for product copy review.

A text input for the TV display text. The field shows the current value. The host may enter any string up to a reasonable character limit (recommended 200 characters; implementer should confirm). CrowdTune-original proposed label: "TV Display Text" - mark for product copy review. CrowdTune-original proposed hint: "Shown below the progress bar on large displays." - mark for product copy review.

Three boolean toggle controls. The source uses checkboxes; the CrowdTune port uses HeroUI Switch primitives. Their labels and descriptions:

- Toggle controlling `allowMultipleVotesPerSearch`. CrowdTune-original proposed label: "Keep search open after adding" - mark for product copy review. CrowdTune-original proposed description: "When on, guests can add multiple tracks in one search session without reopening the search panel." - mark for product copy review. Note: the polarity of the underlying setting is inverted relative to the toggle's visual state - see open question 1 in section 6.

- Toggle controlling `allowExplicitTracks`. CrowdTune-original proposed label: "Allow explicit tracks" - mark for product copy review. CrowdTune-original proposed description: "When off, guests cannot add tracks flagged as explicit by Spotify. Note: Spotify's explicit tagging is not 100% reliable." - mark for product copy review.

- Toggle controlling `allowAnonymousVoting`. CrowdTune-original proposed label: "Require sign-in to vote" - mark for product copy review. CrowdTune-original proposed description: "When on, guests must sign in with a social account before casting votes, reducing spam." - mark for product copy review. Note: the polarity of the underlying setting is inverted relative to the toggle's visual state - see open question 1 in section 6.

A "Flush queue" button. CrowdTune-original proposed label: "Flush Queue" - mark for product copy review. CrowdTune-original proposed description (shown as button tooltip or secondary text): "Removes all tracks from the queue except the one currently playing." - mark for product copy review. The button is disabled while a flush is in progress. A confirmation dialog is recommended before the flush executes to prevent accidental data loss - see open question 2 in section 6.

### Save mechanism: auto-save on change

The source dispatches each individual setting change to the Redux store immediately when the control value changes, with no explicit Save button. The CrowdTune port preserves this auto-save behavior. Each time a toggle is flipped or a text/number input loses focus (on blur), the `useUpdatePartySettings` mutation is fired with the full current settings object. There is no batched Save button.

During a save, the changed control enters a disabled state to prevent conflicting concurrent writes. If two controls change before the first save settles, the second mutation is queued and fires after the first resolves. The implementer should use TanStack Query mutation's natural sequencing rather than hand-rolling a queue.

On save success, no toast is shown (the control immediately reflects the new value; success is silent). On save failure, the control reverts to the pre-change value and an error toast is shown. CrowdTune-original proposed toast message: "Could not save settings. Please try again." - mark for product copy review.

Text and number inputs use on-blur semantics rather than on-keystroke to avoid issuing a save on every character. The input's local state updates on every keystroke (so the field text follows the user's typing), but the mutation is only fired when the input loses focus and the new value differs from the last saved value.

### Flush queue action

When the host taps the Flush Queue button (and confirms, if a confirmation dialog is in scope), the `useFlushQueue` mutation is fired. The button enters a disabled/pending state. On success, the party queue cache is invalidated and the queue view (if currently rendered in a sibling panel) re-fetches. On failure, an error toast is shown. CrowdTune-original proposed toast message: "Could not flush the queue. Please try again." - mark for product copy review.

### Fallback Playlist panel

The panel header and content depend on whether the host has a connected Spotify account.

#### Spotify not connected: sign-in prompt

The panel shows a heading and a Spotify sign-in button. CrowdTune-original proposed heading: "Fallback Playlist" - mark for product copy review. CrowdTune-original proposed button label: "Connect with Spotify" - mark for product copy review.

When the host taps the button, the Spotify OAuth flow is triggered (via the `@/shared/auth` Spotify OAuth initiation). While the OAuth flow is in progress, the button is replaced by a loading spinner and an accessible status message. CrowdTune-original proposed status text (visually hidden for screen readers): "Connecting to Spotify..." - mark for product copy review.

If the OAuth flow completes successfully, the panel transitions to the playlist picker view without a page reload. If the flow is cancelled or fails, the sign-in button is restored and an error toast is shown. CrowdTune-original proposed toast message: "Spotify connection failed. Please try again." - mark for product copy review.

#### Spotify connected: playlist picker

The panel shows the same heading as above. Below it is a text input for filtering the playlist list. CrowdTune-original proposed filter label: "Search your playlists" - mark for product copy review.

While playlists are loading, a spinner is shown in the list area. CrowdTune-original accessible text: "Loading playlists..." - mark for product copy review.

When playlists are loaded, the list shows every playlist matching the current filter text (case-insensitive substring match against the playlist name). When the filter is empty, all playlists are shown. When the filter produces no matches, an empty-state message is shown. CrowdTune-original proposed empty-state message: "No playlists match your search." - mark for product copy review.

Each playlist row displays the playlist name and two action buttons:

- Insert in order: adds the playlist's tracks to the queue in their original Spotify order. CrowdTune-original proposed button label (accessible): "Add [playlist name] to queue in order" - mark for product copy review.
- Insert shuffled: adds the playlist's tracks to the queue in a randomly shuffled order. CrowdTune-original proposed button label (accessible): "Add [playlist name] to queue shuffled" - mark for product copy review.

Both buttons are disabled while any playlist insertion is in progress. The source does not track per-row insertion status; only one insertion may be in progress at a time. When an insertion is in progress, all insert buttons across all playlist rows are disabled simultaneously.

When the host has no Spotify playlists at all, the list area shows an empty-state message. CrowdTune-original proposed message: "No playlists found in your Spotify account." - mark for product copy review.

### State transitions summary

- Loading (party data not yet available): full-panel loading indicator.
- Unauthorized (current user is not the host): unauthorized message, no editing controls.
- Ready (party loaded, user is host): full settings layout with both panels.
- Saving a setting: affected control is disabled, mutation in flight.
- Save succeeded: control re-enabled, no toast.
- Save failed: control reverted, error toast shown.
- Flush in progress: flush button disabled, mutation in flight.
- Flush succeeded: flush button re-enabled, queue cache invalidated.
- Flush failed: flush button re-enabled, error toast shown.
- Spotify auth in progress: sign-in button replaced with spinner.
- Spotify connected (transition): playlist picker appears.
- Playlists loading: spinner in playlist panel.
- Playlists loaded: list rendered, filter input active.
- Insert in progress: all insert buttons disabled across all playlist rows.
- Insert succeeded: insert buttons re-enabled, queue cache invalidated.
- Insert failed: insert buttons re-enabled, error toast shown.

---

## 4. Side Effects

**Shared return shape for all three mutation hooks below**: each is a TanStack Query mutation. The implementer's hook returns the standard `UseMutationResult` shape, which call sites consume as `{ mutate, mutateAsync, isPending, isError, error, reset }`. The `error` field is typed as `Error | null` (the placeholder rejects with a plain `Error` whose message reflects the failure mode; once the backend lands, the real implementation rejects with the project's `ApiError` from `@/shared/api`).

### Update party settings mutation

Each qualifying control change (toggle flip, text/number input blur with a changed value) triggers a PATCH or PUT to the party settings endpoint. In the first port, this is represented by the placeholder hook `useUpdatePartySettings`. The hook accepts the party identifier and the full updated `PartySettings` object. Its mutation function returns a resolved promise immediately (no-op placeholder) until the backend endpoint exists. When implemented, the mutation function will issue the request and on settlement invalidate the TanStack Query cache entry for the party.

### Flush queue mutation

The flush action is represented by the placeholder hook `useFlushQueue`. The hook accepts the party identifier. Its mutation function returns a resolved promise immediately (no-op placeholder) until the backend endpoint exists. When implemented, it will POST to the flush-queue endpoint and on settlement invalidate the party queue cache entry.

### Insert playlist mutation

The insert action is represented by the placeholder hook `useInsertPlaylist`. The hook accepts the party identifier, the playlist identifier, and a boolean flag indicating whether the tracks should be shuffled before insertion. Its mutation function returns a resolved promise immediately (no-op placeholder) until the backend endpoint exists. When implemented, it will POST to the insert-playlist endpoint with the playlist reference and the shuffle flag, and on settlement invalidate the party queue cache entry.

### Fetch host playlists query

The playlist picker is driven by the placeholder hook `useHostPlaylists`. The hook accepts the party identifier (used to identify the host's Spotify credentials on the backend). It returns a TanStack Query result with the standard shape: `{ data, isLoading, isError, error, status }` where `data` is `Playlist[] | undefined`, and `status` is one of `'pending' | 'success' | 'error' | 'idle'` (the implementer may use TanStack Query's `enabled: false` short-circuit to surface the `idle` status when the host has not connected Spotify). The `Playlist` type is **already shipped** at `@/entities/playlist` with the contract `{ name: string; ref: PlaylistReference; trackCount: number }` - the picker renders these three fields per row (cover image is NOT in the current Playlist type and is out of scope for this port; if product wants covers, a separate translation task extends the type). When implemented, the query function will call the backend endpoint that retrieves the host's Spotify playlists using the host's stored Spotify token. The hook must include a docblock stating it is a placeholder pending the backend playlists endpoint.

### Spotify OAuth trigger

Tapping the Spotify sign-in button calls the Spotify OAuth initiation function provided by `@/shared/auth`. This redirects the user (or opens a popup, depending on the auth configuration) to Spotify's authorization page. The CrowdTune auth layer handles the callback and stores the resulting Spotify credentials. The settings view observes the resulting change in Spotify connection status through the session state and transitions the playlist panel without requiring a manual re-fetch.

### No audio output

This view makes no direct use of the Spotify Web Playback SDK and produces no audio output.

### No real-time subscription

The settings view does not open any real-time subscription of its own. The party data is already subscribed at the party page shell level. The view reads from the existing TanStack Query cache.

---

## 5. Edge Cases Worth Preserving

- **Party data still loading**: the view must not flash an unauthorized message before the party record arrives. Render a loading indicator until `party` is non-null, then evaluate the host check.

- **Default settings when settings field is absent**: the `Party` type documents that `settings` is optional and that all fields take documented defaults when absent. The view must apply these defaults rather than showing undefined or blank values. Defaults per `@/entities/party/model/types.ts`: `allowAnonymousVoting: true`, `allowExplicitTracks: true`, `allowMultipleVotesPerSearch: true`, `tvDisplayText: a short call-to-action string referencing the service domain`, `maxTrackLengthMinutes: null`. The implementer must source the default for `tvDisplayText` from a shared constant, not from the Festify source string.

- **Maximum track length cleared to blank**: the host deletes the value in the number input. When the input is blurred with an empty value, the mutation should send `null` (no limit) rather than failing validation or sending zero. The implementer must handle the empty-string-to-null coercion at the mutation call site.

- **Invalid maximum track length (non-positive or non-integer)**: if the host types a decimal or zero or negative number, the field should reject the input visually and not fire the mutation. CrowdTune-original proposed validation message: "Track length must be a whole number greater than zero." - mark for product copy review. Clearing the field to blank remains valid.

- **Concurrent toggle flips**: the host flips two toggles in quick succession before the first save settles. The second mutation should wait for the first to complete rather than issuing both simultaneously with potentially stale settings objects. Use TanStack Query mutation's default behavior (each mutation call enqueues independently); the widget should use the latest saved value from the cache as the base for subsequent mutations, not a locally-held draft.

- **No Spotify playlists**: the host has a connected Spotify account but no playlists. The list area shows the empty-state message. The filter input is still visible and usable (though with a filter applied, the list is still empty and shows the no-match message).

- **Playlist list very long**: no pagination is implemented in the first port. The list renders all matching playlists in a scrollable container. Long playlist names are truncated with an ellipsis.

- **Playlist insertion while another is already in progress**: the host taps an insert button while a previous insertion is still in flight. All insert buttons are disabled while any insertion is in progress, so this case is prevented at the UI level. If the backend receives a duplicate request anyway (e.g., via a race during re-render), it is the backend's responsibility to handle idempotency.

- **Flush while queue is empty**: the flush button should remain enabled even when the queue is empty (the host may not know the queue is empty from this view). The backend will receive the flush request and return success without error. If the product prefers to disable the flush button when the queue is empty, the queue length must be observable from this view; that would require the queue cache to be readable here - see open question 3 in section 6.

- **Host navigates away during a save**: the mutation is in flight and the host navigates away from the settings route. The in-flight mutation should complete and the cache should be invalidated even after the component unmounts. TanStack Query mutations survive component unmount by default; no special teardown is needed.

- **Spotify token expired during playlist fetch**: the `useHostPlaylists` query fails because the stored Spotify token has expired. The playlist panel should show an error state with a prompt to reconnect. CrowdTune-original proposed error message: "Could not load your Spotify playlists. Try reconnecting your Spotify account." - mark for product copy review.

---

## 6. Open Questions for the Implementer

1. **Polarity alignment for toggles**: two of the toggles in the source have an inverted relationship between the underlying boolean field and the toggle's visual "on" state. Specifically, `allowMultipleVotesPerSearch` maps to a visual toggle that is "on" when the feature is enabled (straightforward), but the source's original checkbox was labeled with a negation ("close search after adding"), so the checkbox was checked when the setting was false. Similarly, `allowAnonymousVoting` is false when the UI says "require sign-in" is on. CrowdTune-original labels proposed above use the positive framing (toggle is on when the feature is on) to avoid confusion. The implementer must verify the polarity of each toggle carefully to avoid a bug where the displayed state is the inverse of the saved state. Recommend adding an explicit test for each toggle's polarity before shipping.

2. **Confirmation dialog for flush**: flushing the queue is a destructive action. The source fires the flush immediately when the button is tapped. The CrowdTune port should interpose a confirmation dialog asking the host to confirm. CrowdTune-original proposed dialog title: "Flush queue?" - mark for product copy review. CrowdTune-original proposed dialog body: "This will remove all tracks from the queue except the one currently playing. This cannot be undone." - mark for product copy review. CrowdTune-original proposed confirm button label: "Flush" - mark for product copy review. CrowdTune-original proposed cancel button label: "Cancel" - mark for product copy review. The HeroUI Modal primitive should be used for this dialog; query `get_component_docs` on the `heroui-react` MCP for Modal before implementing.

3. **Queue length observable from settings view**: if the product wants to disable the Flush Queue button when the queue is already empty, the settings widget needs access to the queue length. The queue data is cached at the party page shell level and is accessible via TanStack Query's `useQuery` with the same cache key used by `PartyQueue`. Adding that read to the settings widget is low-cost. Confirm with product whether this optimization is in scope for the first port.

4. **Playlist picker: search endpoint or client-side filter**: the source filters the playlist list client-side against an in-memory list fetched once on mount. `useHostPlaylists` fetches the full list from the backend (which proxies Spotify) and the filter input narrows the display in the browser without additional network calls. This is the recommended behavior for the first port (simple, no debounce needed on the filter). If the host has thousands of playlists (unlikely but possible with Spotify power users), a server-side paginated search may be needed; defer this until it becomes a real complaint.

5. **Dangerous-action scope**: this view handles only one destructive action (queue flush). The source does not include an "End Party" or "Delete Party" action in this settings panel. If CrowdTune adds an "End Party" action in the future, it should appear in this view with a separate confirmation dialog and a dedicated mutation hook. Flag for the product backlog.

6. **TV display text default**: the `PartySettings` type documents `tvDisplayText` as defaulting to "a short call-to-action referencing the service domain". The exact default string must be a CrowdTune-original string (not borrowed from the Festify source). Define a named constant in `@/entities/party/model/types.ts` or a sibling constants file and reference it from both the type documentation and the settings view's default-filling logic. Proposed default: "Join the queue at crowdtune.app" - mark for product copy review.

7. **Re-auth requirement for Spotify**: when the host's Spotify token has expired and the playlist picker shows an error, should the sign-in prompt ask the host to sign in with Spotify again (re-initiating the full OAuth flow) or should it attempt a silent token refresh first? The recommended behavior is a silent refresh attempt via the backend's token refresh endpoint, falling back to the full OAuth flow only if the refresh fails. This depends on how `useHostPlaylists` handles Spotify 401 responses; document this in the placeholder hook's docblock.

---

## 7. Stack Mapping Notes

### Lock-now decisions for this port

**FSD placement - widget, not page**: the settings sub-view is a sub-route of the party page and performs its own data mutations, but it does not introduce a new top-level route boundary. The party page shell at `apps/web/src/pages/party/` already owns the party-level data context (party record, queue, playback). The settings sub-view adds mutation hooks and a playlist query on top of that existing context. The correct FSD placement follows the same rationale used for `PartyTrackSearch`:

- Component: `apps/web/src/widgets/party-settings/ui/PartySettings.tsx`
- Public barrel: `apps/web/src/widgets/party-settings/index.ts`
- Route binding: a thin route file at `apps/web/src/routes/party.$partyId.settings.tsx` that imports `PartySettings` from `@/widgets/party-settings` and binds it via `createFileRoute`. No business logic in the route file.

**Widget reads `partyId` via `useParams`**: the route file passes NO props. The widget calls `useParams({ from: '/party/$partyId' })` internally. This is locked to match the pattern established by all prior party sub-view widgets.

**Save mechanism: locked to auto-save on change**: each toggle flip fires the mutation immediately. Text and number inputs fire on blur when the value has changed. No batched Save button. This matches the source's dispatch-per-change behavior and fits TanStack Query's mutation model naturally. The implementer must NOT add a Save button.

**Placeholder hooks**: all four hooks are placeholders that return resolved no-op promises. They live at:

- `apps/web/src/widgets/party-settings/api/useUpdatePartySettings.ts`
- `apps/web/src/widgets/party-settings/api/useFlushQueue.ts`
- `apps/web/src/widgets/party-settings/api/useInsertPlaylist.ts`
- `apps/web/src/widgets/party-settings/api/useHostPlaylists.ts`

Each must include a docblock stating it is a placeholder pending the corresponding backend endpoint. The deferred concerns must be recorded in `docs/translation-progress.md` under the `party-settings` section.

**Host-gating**: the widget derives host status by comparing `authSession.userId` with `party.createdBy`. If the party is loading, render a spinner. If the party is loaded and the check fails, render an unauthorized message (CrowdTune-original proposed message: "Only the party host can access settings." - mark for product copy review). Do not redirect; render the message in-place. This is a defensive check; the QueueDrawer already hides the Settings link from non-hosts.

**Component shape**: function component, fully controlled. No Zustand reads beyond what `@/shared/auth` exposes. All party and settings data comes from TanStack Query hooks. Local state holds only: the playlist filter text (a string, updated on every keystroke, not debounced), and the Spotify auth-in-progress flag (a boolean, set when the OAuth trigger is fired).

**HeroUI primitives**: the implementer must call `list_components` and then `get_component_docs` on the `heroui-react` MCP before implementing. Candidates to query: Switch (for the three boolean toggles), Input (for party name, max track length, TV display text, and playlist search filter), Button (for Flush Queue, Spotify sign-in, playlist insert and shuffle-insert actions), Spinner (for loading states), Modal (for the flush confirmation dialog if in scope), ScrollShadow or a scrollable container (for the playlist list). Do not hand-roll any of these from raw Tailwind if HeroUI provides a first-class component.

**No dangerous delete-party action**: this view does not include an "End Party", "Delete Party", or "Reset All" action. The only destructive action is queue flush, which is limited in scope and reversible by re-inserting a playlist.

### Accessibility requirements

- Every toggle (Switch) must have a visible label AND an `aria-label` or `aria-labelledby` that unambiguously describes the setting and its current state. The HeroUI Switch component's label prop covers both the visible label and the accessible name; confirm via the MCP before relying on it.
- Toggles that are disabled during a save operation must expose an `aria-disabled` attribute so screen reader users understand the control is temporarily unavailable. They must also carry a visually hidden hint explaining why. CrowdTune-original proposed hint: "Saving..." - mark for product copy review.
- Text and number inputs must have visible labels. Validation error messages must be associated with the relevant input via `aria-describedby` so screen readers announce the error when the field is focused.
- The Flush Queue button must have a descriptive accessible name, not just the button label. Proposed accessible name: "Flush queue - removes all tracks except the currently playing one" - mark for product copy review. If a confirmation dialog is added, the dialog must trap focus until the host confirms or cancels.
- The playlist filter input must carry an accessible label. CrowdTune-original proposed label: "Search your playlists" - mark for product copy review.
- Each playlist row's insert and shuffle-insert buttons must carry accessible names that include the playlist name. Proposed format: "Add [playlist name] in order" and "Shuffle and add [playlist name]" - mark for product copy review.
- While playlists are loading, the list region must carry `aria-busy="true"` and a visually hidden status text so screen readers announce the loading state.
- On successful settings save (auto-save after blur), a brief `aria-live="polite"` region announcement is recommended so keyboard-only users receive confirmation. CrowdTune-original proposed announcement: "Settings saved." - mark for product copy review. On failure, an `aria-live="assertive"` announcement or the toast mechanism should announce the error.
- On successful playlist insertion, a live-region announcement should confirm the action. CrowdTune-original proposed announcement: "[Playlist name] added to the queue." - mark for product copy review.

### Polymer and web-component concepts not carried forward

The source registers a custom HTML element using a framework-specific connect wrapper that binds a Redux state selector and a dispatch map to a lit-html template function. None of that applies in CrowdTune. The settings sub-view is a plain React function component that calls TanStack Query hooks directly. There is no custom element registration, no shadow DOM, no lit-html template literals, no Redux dispatch mapping, and no paper-element Polymer primitives.

### Dependency summary

- `Party`, `PartySettings`, `Playlist` entity types from `@/entities/party/model/types` (already shipped; `PartySettings` has all five fields confirmed from the types file).
- `@/shared/auth` for the current user's identifier and Spotify connection status.
- TanStack Router `useParams` (for `partyId`).
- TanStack Query `useQuery` and `useMutation` (via the four placeholder hooks under `widgets/party-settings/api/`).
- HeroUI Switch, Input, Button, Spinner, Modal (confirm exact API via `heroui-react` MCP before implementing).
- Does NOT import from `@/entities/track/ui/PartyTrackRow` - the settings view has no track row rendering.
- Does NOT import from `@/widgets/queue-drawer` - the settings route is a sibling to the queue-drawer-navigated views.
- Does NOT import from `@/widgets/party-track-search` or `@/widgets/party-queue`.
- `Playlist` and `PlaylistReference` types from `@/entities/playlist` (**already shipped**; ported earlier in the `selectors/playlists.ts` translation). The actual contract is `Playlist = { name: string; ref: PlaylistReference; trackCount: number }` with `PlaylistReference = { id: string; provider: 'spotify'; spotifyUserId: string }`. The picker renders these three fields per row. There is NO cover image field on `Playlist` today; if product wants covers in the picker, a separate translation task extends the entity. The implementer must NOT introduce a new `Playlist` shape - import the existing one.
- Depends on a toast notification mechanism at the party page shell level for failure feedback. Use `console.warn` as the interim fallback in placeholders, matching the pattern established by `PartyTrackSearch`.
- Depends on a Spotify OAuth initiation function from `@/shared/auth`. If this function does not yet exist (the Spotify auth integration is not yet shipped), the implementer should add a placeholder that logs a warning and records the deferred concern in `docs/translation-progress.md`.
