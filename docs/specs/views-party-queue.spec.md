# Spec: Party Queue List Widget

Translation source: Festify `views/party-queue.ts`
Translation date: 2026-05-11
Status: Third UI port. This is the primary track-list view for a live party session. It renders the active queue of upcoming (and currently-playing) tracks, one `PartyTrackRow` per track. It is NOT a search or add-track view; search lives in a sibling view. This is the answer to the orchestrator's open question: the active in-party queue list is confirmed to be `party-queue.ts`.

---

## 1. Purpose

This component presents the live, ordered list of tracks that make up the current party's queue. Every participant in the party - host and guest alike - sees this list as the central display of what is playing and what is coming up next. The list is sorted so that the currently-playing track is always first, followed by all upcoming tracks in order of their combined vote count and addition time. The component handles three distinct states: the initial loading period before queue data has arrived, an empty queue (with role-specific guidance on what to do next), and the populated list of tracks. It is a pure display-and-relay component: it shows the queue and delegates all user actions (voting, skipping, playback control) to the `PartyTrackRow` rows it renders, which in turn bubble those actions up to the feature layer via callbacks.

This view is mounted as a primary content area within the party page shell, not nested inside the queue drawer. The queue drawer (specced in `views-queue-drawer.spec.md`) is a navigation sidebar; this component is the body of the queue route that the drawer links to.

---

## 2. Public Contract

### 2a. Inputs (props)

| Prop | Type | Required | Valid values and notes |
|---|---|---|---|
| Tracks loaded flag | Boolean | Yes | True once the initial fetch of queue data has completed and the track list can be trusted to reflect real state (even if it is empty). False during the initial loading window only. |
| Is-owner flag | Boolean | Yes | True when the currently authenticated user is the host of this party. Governs which empty-state message is shown and which row-level callbacks the host receives (the host's callbacks include skip and remove; these are passed through to each `PartyTrackRow`). |
| Settings route path | String (URL path) | Yes (but may be unused for guests) | The in-app path to the party settings sub-view. Used only in the host's empty-state message as a navigation link. For guest users this prop is present but the link is never rendered. |
| Track list | Ordered list of Track objects | Yes | The already-sorted queue (the parent runs the sort via the shipped `sortedQueue` selector at `apps/web/src/entities/track/lib/queue.ts`). The first item is the currently-playing track. The list may be empty (zero items). Each Track carries its provider reference, vote count, fallback flag, addition time, and ordering field. Sort semantics are owned by the selector spec; the queue component never re-orders. |
| Vote callback | Function | Yes | Called when the user taps the vote button on any row. Receives the track's provider reference and the new desired vote state (true to add a vote, false to remove it). The queue component forwards this to each `PartyTrackRow` unchanged. |
| Remove callback | Function | Yes | Called when the host taps the remove or skip button on any row. Receives the track's provider reference. The queue component forwards this to each `PartyTrackRow` unchanged. |
| Toggle playback callback | Function | Yes | Called when the host taps the play/pause button on the currently-playing row. No payload beyond the intent. Forwarded to the currently-playing `PartyTrackRow`. |
| Transfer playback callback | Function | Yes | Called when the host taps the transfer-playback button on the currently-playing row. Forwarded to the currently-playing `PartyTrackRow`. |
| Navigate callback | Function | Yes | Called when the user taps the settings link in the host empty-state message. Receives the settings route path. The parent handles the actual routing transition. |

Additional per-row props required by `PartyTrackRow` (is-playback-master, has-other-playback-master, has-connected-Spotify-account, is-compatible, toggling-playback, has-voted map) are derived from shared application state by the parent or a connecting wrapper, not by the queue component itself. The queue component receives them and distributes them to each row, or the parent passes them through directly. See section 7 for the lock-now decision on how these are distributed.

### 2b. Outputs and events emitted

The queue component itself does not emit domain events directly. It acts as a relay: all user-interaction callbacks (vote, remove, toggle-playback, transfer-playback, navigate) are passed into `PartyTrackRow` instances and fired upward by those rows when the user interacts. The queue component's own callback props (listed in section 2a) are the surface area through which those interactions reach the feature layer.

There is no internal component event bus, no local mutation, and no state owned by the queue itself.

### 2c. State observed (read from shared application state)

The queue component does not read from shared state directly. A connecting wrapper (the feature-layer parent) reads the following and passes them in as props:

- **Party queue data**: the complete set of tracks currently in the queue, including their vote counts, fallback flags, provider references, addition timestamps, and ordering fields. Read from the TanStack Query cache keyed by party identifier.
- **Queue loaded flag**: whether the initial fetch of party queue data has completed. The parent derives this from the TanStack Query status for the queue fetch.
- **Party host identity**: whether the current user is the host. Derived from `isPartyOwner` in `apps/web/src/entities/party/lib/party-selectors.ts` (already shipped).
- **Settings route path**: the computed URL path to the settings sub-view for this party. Derived from the route selector logic (separate translation task; see `selectors-routes`).
- All per-row flags (playback master status, toggling-playback, has-voted map, Spotify connection status, device compatibility): read from the playback and auth Zustand slices and passed in either as queue-level props or as a per-track map.

### 2d. State mutated

The queue component does not mutate any state directly. All state changes flow through the callbacks listed in section 2a, which are handled at the feature layer.

---

## 3. Behavior

### Loading state

While the tracks-loaded flag is false, the component renders a single centered loading indicator in place of any list or empty-state message. The indicator is positioned in the center of the component's available area with comfortable surrounding margin. No track rows, headings, or empty-state text are shown during this state.

The loading state ends as soon as the tracks-loaded flag becomes true. From that point on, even if the track list is empty, the empty-state message (not the spinner) is shown.

### Empty queue state

When the tracks-loaded flag is true and the track list contains zero items, a role-differentiated message is shown:

- **Host empty state**: a prominent heading announcing that the queue is empty, followed by a secondary message that contains a tappable link to the settings route. The link text invites the host to go to settings to add a fallback playlist. Tapping the link fires the navigate callback with the settings route path and the parent handles the routing transition.

- **Guest empty state**: the same prominent heading announcing that the queue is empty, followed by a secondary message (plain text, no link) inviting the guest to search for their favourite tracks and add them to the queue. The message is informational only; the search affordance itself lives in the sibling search view, not here.

Both headings and messages are centered horizontally within the component with symmetric horizontal margin. They are not full-screen overlays; the normal component background is visible behind them.

### Populated queue - list rendering

When the tracks-loaded flag is true and the track list contains at least one item, the component renders a vertical list of `PartyTrackRow` components, one for each track in the sorted input order.

**Currently-playing row (index 0)**: the first item in the list is passed to `PartyTrackRow` with its is-playing flag set to true. All other rows receive is-playing as false. The currently-playing row is rendered inline at the top of the list - it is not lifted into a separate sticky header or "now playing" section outside the list. It occupies position 0 in the same scrollable column as the rest of the queue.

**Subsequent rows (index 1 onward)**: each receives is-playing as false and its track identity string derived from the track's provider reference. The row at index 1 (immediately after the playing row) receives a visual treatment that adds extra top padding to create a visual gap from the playing row above it - see section 7 for the lock-now decision on how this is expressed in React without adjacent-sibling CSS selectors.

**Track identity key**: each row is keyed by a stable composite string formed from the track's provider name and provider ID ("provider-id"). This key serves as both the React reconciliation key and the `PartyTrackRow` track-identity prop. The component does not construct this key itself; it uses the already-shipped `trackIdentityKey` function from `apps/web/src/entities/track/lib/identity.ts` (or derives the key from the Track object's reference fields, which is the same operation).

**Callback forwarding**: all four action callbacks (vote, remove, toggle-playback, transfer-playback) are passed through to each `PartyTrackRow` instance. The queue component does not intercept or transform these callbacks; it is a pure relay for the feature layer's mutation hooks.

**Alternating row backgrounds**: even-numbered rows (by DOM position, zero-indexed: rows 1, 3, 5, ...) receive a slightly different background color from the default track background, creating a subtle alternating stripe. The playing row at index 0 has its own distinct background (handled by `PartyTrackRow`'s playing-state variant) so the stripe pattern effectively begins from index 1 in the visible list.

### Reorder animation

When the sorted track list changes order (because a vote was cast and the sort function produces a different ranking), the list should animate the tracks smoothly into their new positions rather than snapping instantly. The source achieved this with a DOM-flip animation library that is NOT carried forward in our stack. In our stack this is a progressive enhancement using the View Transitions API or equivalent; the lock-now decision (including the reduced-motion fallback) is in section 7.

---

## 4. Side Effects

### No network calls

The queue component and its immediate parent wrapper do not initiate network requests themselves. All data arrives via the TanStack Query cache managed at a higher level. The component triggers mutations only through the callback props it forwards to `PartyTrackRow` rows; those callbacks are defined and executed at the feature layer.

### Navigation

Tapping the settings link in the host empty-state fires the navigate callback. The parent then calls TanStack Router's navigation function with the settings route path. No history manipulation happens inside the queue component.

### No audio output

The queue component has no direct relationship to Spotify SDK audio output. The toggle-playback and transfer-playback callbacks it forwards may ultimately result in audio state changes, but those effects are managed by the feature layer's mutation hooks and the Spotify SDK integration, both of which are separate translation tasks.

---

## 5. Edge Cases Worth Preserving

- **Loading spinner shown even if cached data is available but the flag is false**: the tracks-loaded flag is the authoritative signal. If the parent has cached track data but marks loaded as false (for example, during a background refresh that invalidates the cache), the spinner is shown. Do not short-circuit the flag check with a "non-empty list" guard.

- **Empty queue after a track is removed**: if the last track is removed from the queue (host or skip of the only track), the track list transitions from one item to zero items. The component shifts from the list view to the empty-state message without an intermediate loading state, because the tracks-loaded flag remains true.

- **Single-track queue**: the list contains exactly one item. That item is at index 0 and receives is-playing true. There is no "second row" to receive the extra top padding. The component renders correctly with a single `PartyTrackRow`.

- **Queue with only fallback tracks**: all tracks have their fallback flag set to true (they came from the host's playlist, not from guest votes). The list renders normally. Each `PartyTrackRow` will show the "Host pick" label (handled inside the row; the queue component is unaware of this detail). The is-playing row is still the first item.

- **Guest empty state with search guidance**: the guest-facing message invites searching but the search input is not present in this component. The message is informational. If the party page shell mounts the search view and queue view simultaneously (e.g., a tab switch or a URL sub-path), this component remains unaware; it renders its message regardless of whether a search input is visible elsewhere on the screen.

- **Host empty state settings link tap**: tapping the link fires the navigate callback and the parent handles routing. The queue component does not perform any direct router call. The link must be an anchor or a TanStack Router Link component, not a Button styled as a link, so keyboard and browser navigation affordances are preserved.

- **Very long queue (many tracks)**: the list grows vertically. No maximum list length is enforced in the source. Scroll behavior is inherited from the container (the party page shell provides the scrollable area). The component itself does not set its own height or overflow; it is a flow element inside its parent's scroll container.

- **Track list reordering after vote**: the sorted order may change between renders. If the vote count on a mid-list track increases past the track at position 1, those two tracks swap positions. The React reconciliation key (the stable identity string per track) ensures the correct `PartyTrackRow` instance is updated rather than destroyed and recreated.

- **Tracks-loaded true, list populated, then subsequent fetch returns empty**: this can happen if the queue is fully cleared server-side between polls. The component transitions to the empty-state message immediately. No residual spinner is shown.

---

## 6. Open Questions for the Implementer

1. **Virtualized list for long queues**: real-world parties can accumulate hundreds of tracks over an evening. The source renders all rows in a flat DOM list with no virtualization. In our stack, if user testing reveals scroll-performance issues on low-end devices, a virtualized list should be evaluated. The implementer should call `list_components` on the heroui-react MCP to check whether HeroUI ships a virtualized list or scroll container primitive before reaching for a third-party virtualization library. This is a stack-discovery question; the first-port default is non-virtualized.

2. **Scroll restoration on route return**: if the user taps the settings link (host empty state) and then returns to the queue route, should the queue restore its previous scroll position? TanStack Router has a scroll-restoration API. This is a product decision - confirm with product whether scroll restoration is required in the first port or deferred to a polish pass.

3. **Maximum queue length display cap**: should the UI ever truncate the visible list at a maximum display count even if the data contains more tracks? The source has no cap. If the product intends to add one (e.g., "show the next 50 tracks, load more on scroll"), that changes the component contract. Confirm with product whether a display cap is in scope for this port.

---

## 7. Stack Mapping Notes

### Lock-now decisions for this port

- **Component shape**: implement as a React function component. It is controlled entirely by props; it holds no local state. The component name is `PartyQueue`.

- **FSD placement**: this component belongs in the `widgets` layer at `apps/web/src/widgets/party-queue/ui/PartyQueue.tsx`, with a public barrel at `apps/web/src/widgets/party-queue/index.ts`. Rationale: the component composes the `PartyTrackRow` entity, reads aggregated party state across multiple entity types (queue data, host identity, playback state), and renders a full content panel with role-differentiated behavior. It is not a pure entity (it does more than display one domain object), not a feature (it does not own mutation hooks), and not a page (it does not bind to a route). The party page shell at `apps/web/src/pages/party/` imports it. The FSD import rule is satisfied: pages import from widgets; widgets import from entities.

- **PartyTrackRow as the only row primitive**: every track in the list is rendered as a `PartyTrackRow` imported from `@/entities/track`. The queue component does not implement any row markup of its own. Do NOT re-spec or re-implement row internals; cross-reference `docs/specs/views-party-track.spec.md` for the full row contract.

- **Sort order is owned by the selectors, not the queue component**: the queue component receives a pre-sorted list. It does not sort, filter, or re-rank the tracks it receives. The sort order is established upstream by the `sortedQueue` function at `apps/web/src/entities/track/lib/queue.ts`. The parent connecting wrapper calls `sortedQueue` (and any additional selector composition needed) before passing the result as the track-list prop. The queue component is sort-agnostic.

- **Currently-playing detection by index, not by a separate flag**: the currently-playing track is always at index 0 in the sorted list. The queue component passes is-playing as true to the row at index 0 and false to all others. It does not query a separate "current track key" from state to determine which row is playing; the sorted order is the canonical signal. This matches the source behavior.

- **Extra top padding on the row at index 1**: the row immediately following the playing row needs a visual gap (extra top padding or margin). In the source this is expressed via an adjacent-sibling CSS selector, which does not translate to React component props. In our stack, the queue component should pass a boolean prop (for example, an "has-playing-row-above" variant flag) to the row at index 1 when the list has at least two items. `PartyTrackRow` applies the extra top padding when this flag is true. Do NOT use adjacent-sibling selectors in the CSS for this; the component tree structure does not guarantee them. The `PartyTrackRow` spec already documents this decision in section 3 ("Row border with the row above").

- **Alternating row background**: the even/odd stripe is a presentational concern. In our stack, pass an index-parity prop (for example, a boolean "is-even-row" flag) to each `PartyTrackRow` and let the row apply the appropriate background token. Alternatively, if HeroUI's list primitive applies alternating stripes natively via its own variants, use that. The implementer must call `list_components` / `get_component_docs` on the heroui-react MCP to check. Do NOT hardcode alternating background colors inline; use the theme token.

- **Reorder animation**: the source uses a DOM-flip animation library that is NOT carried forward. In our stack, implement reorder motion as a progressive enhancement using the standard browser View Transitions API or a lightweight CSS-keyed animation library if available. If neither is practical in the first port, ship without animation and add a follow-up task. Do NOT block the first port on animation completeness; ship the static list first. **Reduced motion**: when the user's system reports `prefers-reduced-motion: reduce`, skip the reorder transition entirely - rows snap to their new positions with no animation. Apply this guard before invoking any animation API. This is an accessibility requirement, not an opt-out toggle.

- **Loading indicator**: the HeroUI Spinner component should be the loading indicator primitive (call `get_component_docs` on the heroui-react MCP to confirm the API). It should be centered with a comfortable vertical margin matching the source's 32px outer margin. Do not use a skeleton or placeholder row list during loading; the source uses a spinner, and that is the locked behavior for this port.

- **Empty-state headings**: use HeroUI typography primitives for the empty-state headings (h2-equivalent for the primary heading, h3-equivalent for the secondary message or link). Center them horizontally. Do not use Card or Modal wrappers for the empty-state; it is an inline content block within the component's normal flow.

- **Host settings link in empty state**: render the link as a TanStack Router Link component (or a plain anchor) rather than a Button styled as a link. The link wraps only the "Go to settings" text within the secondary message, not the entire message. The surrounding explanatory text is plain, not a link. Tapping fires the navigate callback with the settings route path; the parent handles the routing call.

- **Callback props vs hooks inside the component**: the queue component accepts vote, remove, toggle-playback, and transfer-playback as callback props. It does NOT call TanStack Query mutation hooks directly. The mutation hooks live in the feature layer (for example, `apps/web/src/features/queue-vote/` and related feature slices). The connecting wrapper at the feature or page level wires mutation callbacks and passes them down. This mirrors the `PartyTrackRow` contract and keeps the queue component testable in isolation with mock callbacks.

- **Per-row state distribution**: per-row flags such as has-voted, is-playback-master, toggling-playback, is-compatible, and has-connected-Spotify-account are needed by each `PartyTrackRow` instance. The queue component should receive these either as a map keyed by track identity string (for flags that vary per track, like has-voted) or as scalar props repeated to every row (for flags that are party-wide, like is-playback-master and toggling-playback). The connecting wrapper at the feature level assembles these from Zustand slices and TanStack Query cache. The queue component does not read Zustand directly.

- **No search integration in this component**: the search and add-track affordance is not part of this component. The `party-track-search` element referenced in the source's CSS sibling selector exists in a separate Festify view (not yet translated). In our stack, the search view will be a separate widget or feature component mounted alongside this one in the party page shell. The queue component is queue-display only.

- **Selectors to use by reference** (the parent connecting wrapper calls these; the queue component itself does not):
  - `sortedQueue` from `apps/web/src/entities/track/lib/queue.ts` - produces the sorted track list prop.
  - `currentTrack` and `currentTrackKey` from the same module - used by the parent to derive ancillary state (e.g., confirming the currently-playing identity for per-row prop assembly), not called inside the queue component.
  - `isPartyOwner` from `apps/web/src/entities/party/lib/party-selectors.ts` - produces the is-owner flag prop.
  - `isPlaybackMaster` and `hasOtherPlaybackMaster` from the same module - produce the playback-state props forwarded to the currently-playing row.
  - `voteStatusLabel` and `formatArtists` from `apps/web/src/entities/track/lib/labels.ts` - used inside `PartyTrackRow`, not called by the queue component.

- **HeroUI primitives to query via MCP before implementing**: the implementer must call `list_components` and `get_component_docs` on the heroui-react MCP for: Spinner (loading state), ScrollShadow (scrollable list container with a shadow fade at top/bottom edges if available), and any List or Listbox primitive (for the track list structure). Do NOT hand-roll a div-based scroll container if HeroUI provides one with built-in shadow and scroll-snap behavior.

### Polymer and web-component concepts not carried forward

The source registers a custom HTML element using a framework-specific connect pattern. None of that applies in our stack. The CrowdTune implementation is a plain React function component receiving props and forwarding callbacks, with no custom element registration, no shadow DOM, no lit-html template literals, and no framework-specific state-connection wrapper.

### Dependency summary

- `PartyTrackRow` and its associated props type from `@/entities/track` (already shipped).
- `Track` and `Metadata` entity types from `@/entities/track/model/types` (already shipped).
- `sortedQueue`, `currentTrack`, `currentTrackKey` from `@/entities/track/lib/queue` (already shipped; the queue component imports none of these directly - the parent does).
- `trackIdentityKey` from `@/entities/track/lib/identity` (the queue component uses this to produce each row's track identity string from the Track object).
- `isPartyOwner`, `isPlaybackMaster`, `hasOtherPlaybackMaster` from `@/entities/party/lib/party-selectors` (used by the parent wrapper; the queue component receives results as props).
- TanStack Router Link or navigate for the host empty-state settings link.
- A HeroUI Spinner primitive for the loading state (confirm exact import via MCP).
- Optionally a HeroUI ScrollShadow or equivalent scroll container (confirm via MCP).
- Does NOT depend on `views-queue-drawer` or `selectors-routes` for its own rendering; those are party-page-shell concerns.
