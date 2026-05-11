# Spec: Party Track Row Component

Translation source: Festify `views/party-track.ts`
Translation date: 2026-05-11
Status: First UI port. This component is the atomic row element reused by the queue drawer, the party queue list, the TV display, and the main party view. All four of those subsequent ports depend on this spec being complete and precise.

---

## 1. Purpose

This component renders a single track entry inside a live party queue list. A visitor to a party sees one of these rows for every song currently in the queue. The row shows who the track is (title, artists, artwork), where it stands in the party (vote count, host pick, currently playing, paused), and what the visitor can do about it (vote, skip if host, play or pause if host and this device is the audio master, or transfer audio playback to this device). It is the only place in the product where a guest interacts with a specific queued song.

---

## 2. Public Contract

### 2a. Inputs (props)

Every instance of this row requires a track identity string (a stable composite key, not a raw Spotify track ID) and a flag indicating whether this particular row is the currently-playing track. These two values arrive from the parent list component and are the only "own" props the row needs; all other data is derived from shared application state using the identity string as the lookup key.

| Prop | Type | Required | Valid values |
|---|---|---|---|
| Track identity string | String (composite provider key) | Yes | Non-empty string in "provider-id" format as defined in the track selectors spec |
| Is-playing flag | Boolean | Yes | True when this row is the current head of the queue; false for all other rows |

### 2b. Derived data consumed from application state

The row reads the following data from the shared application state, keyed by the track identity string:

- **Track record**: the full Track entity for this row, including its vote count, fallback flag, and provider reference. May be null if the track has not yet loaded.
- **Track metadata**: the Metadata entity for this row, including display name, artist list, and cover image list. May be null before the metadata fetch completes.
- **Artist display string**: a single pre-formatted string joining all artist names ("Primary feat. Second & Third" or just "Artist Name"). Null when metadata is absent or the artist list is empty.
- **Vote status label**: a human-readable string describing the track's status. See section 3 for the exact evaluation order. Locked strings in our stack (from `apps/web/src/entities/track/lib/labels.ts`): "Now playing", "Paused", "${n} votes" (for n greater than 1), "1 vote" (for exactly one vote), "Host pick" (for a host-added fallback track with zero votes), "Pending" (for a guest-added track with zero votes).
- **Has-voted flag**: a boolean indicating whether the currently authenticated user has already voted for this track in this session. Used to toggle the vote button's visual state.
- **Is-owner flag**: a boolean indicating whether the authenticated user is the party host. Controls which action buttons appear.
- **Is-music-playing flag**: a boolean indicating whether the party's Spotify playback is currently active (not paused). Used on the currently-playing row to determine which icon to show on the play/pause button.
- **Is-playback-master flag**: a boolean indicating whether this browser tab is the designated audio-output controller for the party. When false and a master exists elsewhere, the "transfer playback" button may appear.
- **Has-other-playback-master flag**: a boolean indicating that some other device holds the master role right now. Used together with other conditions to decide whether the transfer button is shown.
- **Has-connected-Spotify-account flag**: a boolean indicating whether the current user has a Spotify account connected. Required (along with device compatibility) before the host can control playback from this device.
- **Is-compatible flag**: a boolean indicating whether the current browser/device supports the Spotify Web Playback SDK. When false, the host can only control a master on another device, not initiate one here.
- **Toggling-playback flag**: a boolean indicating a play/pause request is currently in flight. Used to disable the play/pause button and show an activity indicator.
- **Play button enabled flag**: a derived boolean that combines the is-owner check, the toggling-playback flag, device compatibility, and Spotify account connection to determine whether the play/pause floating action button is interactive. Detailed derivation in section 3.

### 2c. Actions emitted

The row triggers the following actions when the user interacts with it:

- **Set vote**: toggling a vote on or off. Carries the track's provider reference and a boolean indicating the new desired vote state (true to upvote, false to remove the vote). This is the only vote action; there is no downvote.
- **Remove track**: removes the track from the queue immediately. Carries the track's provider reference. Available only to the host on non-playing tracks that have at least one vote or are a fallback.
- **Toggle play/pause**: sends a request to start or stop Spotify playback for the whole party. Carries no payload beyond the intent to toggle. Available only to the host via the play/pause button.
- **Transfer playback**: nominates this browser tab as the new audio playback master for the party. Carries no payload; the backend records the local player instance identifier as the new master.

---

## 3. Behavior

### Rendering sequence

When the row mounts, it reads all derived data listed in section 2b from application state using the track identity string. It renders immediately with whatever data is available; it does not block on loading states with a spinner of its own (the parent list is responsible for skeleton states during initial load, if any).

### Layout regions

The row is laid out horizontally in three semantic regions:

1. **Leading visual** (leftmost): the cover image, or a placeholder block if metadata is not yet available.
2. **Metadata block** (center, expanding): the track title as the primary text, and below it a secondary line containing the artist display string, a separator, and the vote status label.
3. **Trailing actions** (rightmost): one or more icon-buttons arranged horizontally, varying by the row's state and the current user's role.

### Cover image

When metadata is available and contains at least one image, the row renders the cover image scaled to a fixed square size (the source uses 54px as both width and height; in our stack pass the appropriate size hint to whichever image component is chosen, requesting the nearest available resolution). The image list is ordered by the provider with the largest image first; the row requests a specific rendered size of 54px and the image component selects the closest resolution from the available list.

When metadata is absent or the image list is empty, the row renders a plain placeholder block of the same dimensions with a neutral background. This prevents layout shift when metadata loads.

### Primary text (track title)

When metadata is available, render the track's display name (the title field from Metadata). When metadata is absent, render a loading placeholder text (in our stack this should be a neutral string that does not make a domain promise, such as "Loading..." or equivalent). The title is rendered as a single line with overflow truncation; it does not wrap.

### Secondary text line (artist + separator + vote status)

This line is shown only when the artist display string is non-null (i.e., metadata is present and has at least one artist). It contains three inline elements: the artist string, a visual separator (a middle dot or equivalent), and the vote status label produced by the label function described in section 2b. The line is also single-line with overflow truncation.

When the artist display string is null (metadata loading or no artists), this entire secondary line is hidden. There is no partial rendering with only the vote status label.

### Vote status label (locked strings)

The vote status label is computed by the already-shipped `voteStatusLabel` function at `apps/web/src/entities/track/lib/labels.ts`. The row receives this pre-computed string as a derived prop and renders it verbatim. The evaluation order is:

1. If the track record or the party playback object is absent, the label is an empty string (no text shown).
2. If this row is the currently-playing track and the party is playing, the label is "Now playing".
3. If this row is the currently-playing track and the party is paused, the label is "Paused".
4. If the track has more than one vote, the label is "${n} votes" where n is the vote count as an integer.
5. If the track has exactly one vote, the label is "1 vote".
6. If the track has zero votes and the fallback flag is true (the track came from the host's playlist), the label is "Host pick".
7. If the track has zero votes and the fallback flag is false, the label is "Pending".

### Trailing actions - vote button (non-playing rows only)

For any row that is not the currently-playing row, a vote button appears in the trailing action area. The button icon has three states:

- **Already voted**: a filled heart icon (or equivalent "liked" icon). The user has upvoted this track.
- **Has votes or is a fallback, but current user has not voted**: an outlined heart icon. The track has at least one vote from someone else, or it is a fallback track, but this user has not voted yet.
- **No votes and not a fallback**: an "add" or plus icon. The track is not yet voted on by anyone and is not from the host's playlist.

Tapping the vote button toggles the user's vote: if the user has voted, it removes the vote; if the user has not voted, it adds a vote. This is the only direction of voting - there is no downvote or negative vote. The action sends "set vote" with the track reference and the toggled boolean.

The vote button has an accessible label that includes the track's display name (or a loading fallback if metadata is absent) and the intent ("Vote for [track]" or "Unvote [track]").

### Trailing actions - remove track button (host only, non-playing rows)

A remove (clear/X) icon button appears only when all of the following are true:

- The current user is the host (is-owner is true).
- The track has at least one vote OR it is a fallback track (tracks with zero non-fallback votes are effectively invisible, so this condition prevents removing a newly-added track before it has any engagement).
- The row is not the currently-playing track.

Tapping the remove button immediately removes the track from the queue. The action sends "remove track" with the track reference. There is no confirmation prompt in the source; the action is immediate.

### Trailing actions - play/pause button (currently-playing row, host with compatible device or master on other device)

For the row that is the currently-playing track, the vote button is replaced by a floating-action-style play/pause button (visually distinct from the regular icon buttons - larger, with a tinted background). The button shows:

- A pause icon when the party is currently playing music.
- A play-arrow icon when the party is paused.

This button is enabled when the "play button enabled" flag is true (see derivation below). When disabled, the button remains visible but is rendered in a reduced-opacity state and does not respond to taps.

While a play/pause toggle request is in flight (toggling-playback is true), an activity spinner is rendered overlaid on top of the play/pause button. The button itself is also disabled during this period (the enabled flag accounts for the toggling state).

Tapping the enabled button sends the "toggle play/pause" action.

**Play button enabled derivation**: the button is enabled when all four conditions hold simultaneously:

1. The current user is the host.
2. No play/pause toggle request is currently in flight.
3. Either the current device is compatible with the Spotify Web Playback SDK, or another device is already serving as the playback master (meaning the host can send commands to that other device without needing local SDK support).
4. Either the current user has a Spotify account connected to this session, or another device is already serving as the playback master (meaning Spotify credentials are provided by the master device rather than needed locally).

Conditions 3 and 4 are each independently satisfied either by local capability or by the existence of a remote master. This means a host without a compatible browser or without Spotify connected can still issue play/pause commands as long as another device is already the master.

### Trailing actions - skip button (host only, currently-playing row)

When the row is the currently-playing track and the current user is the host and the track record is non-null, an additional skip icon button appears alongside the play/pause button. Tapping the skip button removes the currently-playing track from the queue (which advances playback to the next track). The action sent is "remove track" with the track reference, identical to the remove button on non-playing rows.

The skip button has an accessible label naming the track (or a loading fallback).

### Trailing actions - transfer playback button (host only, currently-playing row)

A "transfer playback to this device" button appears when all of the following are true:

- The row is the currently-playing track.
- The current user is the host.
- The current device is not the playback master (is-playback-master is false).
- Another device is the playback master right now (has-other-playback-master is true, which implies a master identifier is set in the party record).
- The current device is compatible with the Spotify Web Playback SDK.
- The current user has a Spotify account connected.

When all six conditions hold, a download or "pull-here" icon button appears. Tapping it sends the "transfer playback" action, which nominates this browser tab as the new audio master. After this action completes, this device takes over audio output and the transfer button disappears (because the current device is now the master).

### Currently-playing row visual treatment

When the row's is-playing flag is true, the entire row receives a distinct background to visually separate it from the rest of the queue list. The row is also taller than a normal queue row (the source adds extra vertical padding). The cover image receives a subtle drop shadow.

### Row border with the row above

When the playing row is followed immediately by a normal row (which is always the case unless the playing track is the last in the queue), the row immediately below the playing row receives extra top padding to match the visual gap. The implementer should express this as a top-margin or padding variant on the second row when the first row is in the playing state, rather than relying on adjacent-sibling CSS selectors, since React component trees do not support adjacent-sibling selection at the component level.

---

## 4. Side Effects

### Vote toggle

Sending "set vote" results in an API call that either records or removes the current user's vote for the specified track. The backend increments or decrements the track's vote count and writes to the user-votes table. The row does not perform optimistic updates locally (the source does not draw that distinction explicitly); the updated vote count and has-voted flag are received via the next state refresh. In our stack, this action becomes a TanStack Query mutation that invalidates the party queue query on settlement.

### Remove track / skip

Sending "remove track" results in an API call that deletes the queue entry for the specified track. For the skip case on the currently-playing track, the backend also advances playback to the next track in the queue (or stops playback if the queue is now empty). The row does not handle the response directly; the parent list re-renders from the updated queue state.

### Toggle play/pause

Sending "toggle play/pause" results in an API call (or Spotify Web Playback SDK call) that changes the Spotify playback state. The toggling-playback flag is set true immediately (optimistic UI at the loading-state level), the button is disabled, and the spinner appears. On success or failure, the toggling-playback flag is cleared and the button re-enables. In our stack this is a TanStack Query mutation; on error, a toast notification should be shown (handled at the feature or page level, not inside this component).

### Transfer playback

Sending "transfer playback" results in an API call that sets the current device's player instance identifier as the party's playback master. This involves registering the local Spotify Web Playback SDK device with the party's backend record. The action is described in the party-data actions module (separate translation task).

---

## 5. Edge Cases Worth Preserving

- **Metadata not yet loaded**: the track record exists in the queue but the Metadata has not been fetched. The cover image shows a placeholder, the title shows a loading text, and the secondary line (artist + vote status) is entirely hidden. The vote button is still rendered but its accessible label uses the loading text for the track name.
- **Track record null**: if the track record itself is null (the queue entry was removed between the parent list rendering and this row mounting), the vote button is not rendered at all (a null check guards it). The row still displays safely because the layout regions still mount with fallback values.
- **Zero votes, non-fallback track**: the vote status label is "Pending". The vote button shows the "add" plus icon, not the heart, because the track has no votes from anyone.
- **Zero votes, fallback track**: the vote status label is "Host pick". The vote button shows an outlined heart, not the plus icon, because the icon-state derivation treats "has any votes OR is a fallback track" as the unified outlined-heart condition.
- **Track has votes but the current user has not voted**: the vote button shows the outlined heart icon. The label shows the count ("2 votes", "1 vote").
- **Track has votes and the current user has voted**: the vote button shows the filled heart icon. The user's second tap will remove the vote (toggle to false).
- **Host on incompatible device, no other master**: the play/pause button is visible (because the row is playing) but disabled. The enabled derivation fails on condition 3 (incompatible) and condition 3's fallback (no other master). The button appears at reduced opacity.
- **Host on compatible device, Spotify not connected, no other master**: disabled for the same reason - condition 4 fails and its fallback (no other master) also fails.
- **Host on compatible device, Spotify connected, no other master**: fully enabled. This is the standard host scenario.
- **Host with another device as master**: conditions 3 and 4 are satisfied by the "other master" fallback. The play/pause button is enabled. The transfer button also appears (since another device is the master and this device is compatible and connected).
- **Guest user (is-owner false)**: the play/pause button, skip button, remove button, and transfer button are all hidden. Only the vote button is shown. The guest cannot affect playback or queue removal directly.
- **Playback toggle in flight**: the play/pause button is disabled and the spinner overlay is active. The skip button is also disabled in this period (locked CrowdTune default: skip is gated by the same toggling-playback flag that disables play/pause, so the user cannot issue a second mutation against the playing track while a first is in flight). The transfer-playback button is not affected by toggling-playback and remains independently interactive.
- **Currently-playing track with null track record**: the skip button is not shown (guarded by a null check on the track record). The play/pause button still appears if other conditions permit.

---

## 6. Open Questions for the Implementer

1. **Cover image primitive**: the Metadata entity carries a list of cover images with different pixel dimensions. The component renders at a fixed 54px square. The implementer must call `list_components` / `get_component_docs` on the heroui-react MCP to confirm whether HeroUI offers an Avatar or Image primitive that handles the closest-size heuristic, and choose between that primitive vs a plain img element with manual size selection. This is a stack-discovery question, not a product question.

2. **Vote button gate for anonymous guests**: the row currently dispatches "set vote" on every vote-button tap regardless of authentication state. The `PartySettings.allowAnonymousVoting` flag from the party entity (from state.spec.md) is the relevant product knob - if false, tapping the vote button while unauthenticated should open the sign-in modal rather than dispatching a vote action. Confirm with product whether CrowdTune ships with allowAnonymousVoting defaulting to true (Festify behavior) or false (require sign-in).

3. **Playing-row visual treatment**: the playing row needs a distinct background and extra vertical padding compared to a normal queue row. The implementer must call `list_components` / `get_component_docs` on the heroui-react MCP to confirm whether HeroUI's Card or List item primitive offers a built-in "selected" or "active" variant that expresses this, vs applying the variant via Tailwind modifier classes on a HeroUI structural primitive. This is a stack-discovery question.

---

## 7. Stack Mapping Notes

### Locked decisions for the first port

- **Host action layout**: render skip / play-pause / transfer as inline trailing icon buttons. Match the source's layout for now. If mobile feedback later shows crowding, refactor to a context menu in a follow-up port - do NOT preempt that work in this first implementation.
- **Vote-tap behavior**: server-confirmed only. Do NOT apply optimistic local toggle of `hasVoted` or the displayed vote count in this port. The vote button enters a brief disabled state while the mutation is in flight (use the standard TanStack Query mutation pending flag), then re-enables when the mutation settles. Optimistic updates are a separate UX pass once we have telemetry on vote latency.
- **Skip button gating during play/pause toggle**: skip is disabled whenever the toggling-playback flag is true (per section 5 lock). The implementer must wire skip's disabled prop to the same flag that disables play/pause.

### FSD and component shape

- This Festify component maps to a React function component at `apps/web/src/entities/track/ui/PartyTrackRow.tsx` (or similar) in the FSD entity layer. Because it renders a single track with no feature-level side effects of its own (it receives action callbacks as props), it belongs in the `entities/track` slice. If the vote mutation and remove mutation are co-located here, they move to the `features` layer instead (for example, `features/queue-vote` and `features/queue-remove`). Decide the FSD placement before writing the component.

- The implementer must call `list_components` and `get_component_docs` on the heroui-react MCP before choosing primitives. Likely candidates: a plain horizontal layout composed from HeroUI structural primitives for the row shell, HeroUI Button or IconButton for all action buttons, and the HeroUI Avatar or Image component (if available) for the cover image.

- The four derived data items from application state (track record, metadata, artist string, vote status label) do not flow from a Redux store. In our stack they come from: a TanStack Query cache keyed by party ID and track identity (for track and metadata), and the already-shipped `formatArtists` and `voteStatusLabel` functions from `apps/web/src/entities/track/lib/labels.ts` applied to that cached data. The component does not call these functions itself if the parent list pre-computes them; alternatively the component can call them inline given the raw track and metadata objects. Either way, no Redux selector factory is needed - these are plain function calls.

- The "is-owner", "is-playback-master", "has-other-playback-master", "has-connected-Spotify-account", "is-compatible", and "toggling-playback" props all come from the selectors described in `selectors-party.spec.md` (a completed translation). The parent list or a wrapping feature component should derive these from shared Zustand slices and pass them down as props to keep the row component testable in isolation.

- The "play button enabled" derivation is a pure boolean computation and should live outside the component, either as a utility function or as the result of combining Zustand selectors in the parent. Do not embed the four-condition AND-expression inside the JSX template; extract it as a named variable or helper.

- The `localInstanceId` for the "is this device the playback master" check must arrive via a prop (or a shared Zustand selector read at the parent level), not by the row component reading the player Zustand slice directly. This keeps the row component free of store dependencies and makes the master-takeover condition independently testable.

- The "set vote", "remove track", "toggle play/pause", and "transfer playback" dispatch calls in the source map to TanStack Query mutations defined in the appropriate feature slice. The row component accepts these as callback props (`onVote`, `onRemove`, `onTogglePlayback`, `onTransferPlayback`) and does not import or call the mutation hooks directly. This is consistent with the FSD rule that entity-layer components receive callbacks from feature-layer callers.

- The vote-button-enabled flag (`play button enabled`) described in section 3 is a derived boolean with four input conditions. Depends on: the host-identity check from `selectors-party.spec.md`, the Spotify credentials state from the spotify-auth spec, and the player compatibility flag. All are separate translation tasks already shipped or specced.

- Depends on the `Track` and `Metadata` entity types from `state.spec.md` (already translated).
- Depends on the `voteStatusLabel` and `formatArtists` functions from `selectors-track.spec.md` (already shipped at `apps/web/src/entities/track/lib/labels.ts`).
- Depends on the host-identity, is-playback-master, and has-other-playback-master selectors from `selectors-party.spec.md` (already translated - separate implementation task).
- Depends on a Spotify credentials / has-connected-Spotify-account selector (from the spotify-auth spec - shipped).
- Depends on the "remove track", "set vote", "toggle play/pause", and "transfer playback" action/mutation modules (separate translation tasks - not yet ported).
