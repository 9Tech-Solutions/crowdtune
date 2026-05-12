# Spec: TV Mode Page

Translation source: Festify `src/views/view-tv.ts` (plus companion sub-component `src/views/tv-track.ts`)
Translation date: 2026-05-12
Status: Fifteenth UI port. This is the big-screen read-only display companion to the party queue. It mounts at a dedicated TV-mode route under the party and renders a full-viewport ambient display designed to be put on a projector, TV, or shared screen at a venue. No interactive queue controls appear; the view is intentionally passive.

Reference provenance: Festify source is LGPLv3 licensed. This spec is a clean-room behavioral description only. No Festify source, CSS class names, or variable names are reproduced below.

---

## 1. Purpose and Route Binding

The TV Mode page is a full-screen ambient display intended to be shown on a large shared screen - a projector, a wall-mounted TV, or a secondary monitor at a venue. While guests use their phones to vote and the host uses the main party view to manage the queue, the TV screen shows everyone in the room what is currently playing and what is coming up next. It requires no interaction from the audience; it updates automatically as the queue changes.

The page fills the entire viewport with no application chrome (no navigation header, no back button, no settings links). All content uses viewport-relative sizing so that it looks proportional on screens of wildly different physical sizes, from a 13-inch laptop to a 75-inch TV.

The CrowdTune route for this page should be `/party/$partyId/tv`. This is a sibling of the existing `/party/$partyId` route, not a child nested inside the party shell. The party shell's navigation chrome must not be visible on this route; it is a standalone full-viewport page. The `partyId` path segment is the party's short identifier, matching the convention established by all prior party sub-views.

---

## 2. Public API and Props Contract

The TV Mode page is a route-level component. It accepts no React props from a parent. All data is derived internally from:

- The URL parameter `partyId` (the party's short identifier), read via TanStack Router's `useParams` hook.
- The TanStack Query cache, warmed by queries the page initiates itself (or inherits if the party data is already cached from a prior visit to the main party route).
- The authenticated user session from `@/shared/auth`, used only to confirm the page is being viewed in the context of a known party (no host-gate check is needed because this view is intentionally world-readable as a display screen).

There is no prop interface for the implementer to define beyond the zero-prop page component itself.

### State observed

The page reads the following domain state:

- **Current party record**: the full Party object including its `shortId` join code, its `tvModeText` custom message (a per-party configurable string the host can set, used in the now-playing metadata block), and its loading and error states. Read from the TanStack Query cache keyed by `partyId`.
- **Party queue tracks**: the sorted list of all tracks currently in the queue. Read from the TanStack Query cache. The queue is sorted using the same `Track.order` ascending / `addedAt` lex tie-break convention locked in by prior ports. The first item in the sorted list is the currently-playing track.
- **Track metadata**: display metadata (cover art URL array, artist names, track name, background image array) for each track in the queue. This data is needed to render the now-playing block and the upcoming-track strip. It may arrive asynchronously after the queue list itself.
- **Playback progress**: the playback position and duration needed by the progress bar in the now-playing block. Read from the same playback Zustand slice already used by `PlaybackProgressBar`.
- **Queue-load status**: a boolean indicating whether the initial queue fetch has completed, distinguishing the loading state from the genuine empty-queue state.
- **Party-load error**: an error object (or null) set when the party record fails to load.

### State mutated

This page mutates no application state. It is a pure read-only display. No vote buttons, no skip controls, no settings links, no remove actions are present.

---

## 3. Render States

The TV Mode page passes through mutually exclusive render states:

**Loading state** - active while either the party record or the track metadata for the currently-playing track has not yet resolved. This includes the initial load of a fresh visit, and any transition where the currently-playing track changes to a track whose metadata has not yet been fetched. The entire viewport shows a centered loading indicator with the application logo beside a loading message. No queue strip, no album art, no progress bar is shown. Trigger: `isLoading` is true, OR the queue is non-empty but the currently-playing track's metadata object has not yet arrived.

**Error state** - active when the party record fails to load (a network error, a missing party, a permission denial). The full viewport shows a centered error panel with a prominent icon, a short error heading, and the error message text. No queue content is shown. Trigger: `partyLoadError` is non-null.

**Empty-queue state** - active when loading has completed, no error occurred, but the queue contains zero tracks. The full viewport shows a centered panel with the application logo, a heading announcing the queue is empty, and the party's custom TV mode text (which typically tells guests where to go to add songs). Trigger: loading is complete, no error, and the sorted track list has length zero.

**Populated state** - the primary display state. Active when loading is complete, no error occurred, and the queue has at least one track. Renders the full two-region layout described in section 6. Trigger: loading complete, no error, track list length is at least one, and metadata for the currently-playing track is available.

---

## 4. Behavior

### 4.1 Data loading

When the page mounts, it initiates (or re-uses cached) TanStack Query subscriptions for the party record and the party queue. If the party shell's queries are already active and the cache is warm (the user navigated to TV mode from an existing party session), the page renders immediately into the populated state without any loading flicker. If arriving cold (the URL was opened directly on a TV browser), the page shows the loading state until all required data arrives.

### 4.2 Queue strip population

The queue strip at the bottom of the populated layout shows at most 29 upcoming tracks: specifically, tracks at index positions 1 through 29 of the sorted queue (the track at index 0 is the currently-playing track, displayed in the upper region; it is not duplicated in the strip). If the queue has fewer than 29 upcoming tracks, the strip shows only as many cards as exist. The strip does not show the currently-playing track. This slice is a locked behavior derived directly from the source.

### 4.3 Queue strip animation

When the queue order changes (a new track begins, votes shift the order, a track is added or removed), the queue strip's cards animate into their new positions. In the reference implementation this is handled by a flip-animation library that records card positions before and after a DOM change and tweens them. In the CrowdTune port this should be replicated using CSS transitions on each card's transform, or a React layout-animation library (see open question OQ-3). The animation must respect `prefers-reduced-motion` (see section 9).

### 4.4 Background display

In the populated state, a full-viewport background image is displayed behind both the upper and lower regions. The background is rendered at low opacity (approximately 30%) and with a heavy blur (approximately 7 px), creating an ambient glow. The background image source depends on what metadata the currently-playing track provides:

- If the track's metadata includes a non-empty array of background images, the background cycles through those images using a slow Ken Burns (pan and zoom) animation. The specific image chosen as the starting frame is selected by a deterministic index derived from the track name's character count modulo the array length, so the starting frame is consistent across clients for the same track.
- If the track has no background image array (only a cover art image), the cover art itself is used as the background, scaled to cover the full viewport and blurred.

The background is positioned absolutely behind all other content and does not participate in the vertical layout of the upper and lower regions.

### 4.5 Mouse cursor auto-hide

The page listens for mouse movement events on the full viewport. When the user moves the mouse (e.g. when setting up the display), the cursor becomes visible. After three seconds of no mouse movement, the cursor hides automatically. Any new mouse movement restarts the three-second timer. This is the only interactive behavior in the page; it exists purely for the setup experience and produces no application state change. On touch-only devices (phones, tablets used as the TV screen) this behavior is irrelevant and has no effect.

### 4.6 Background image index determinism

The selection of which background image to show first is computed by taking the length of the currently-playing track's name string and computing modulo the number of background images available. This produces a consistent starting frame for all clients simultaneously displaying the same track, so the ambient background does not look different on different screens in the same venue. If no background images exist, the computation produces null and the cover-art fallback is used instead.

### 4.7 No user actions

This page has no clickable or tappable elements in its populated state. There are no vote buttons, no skip controls, no add-track buttons, no settings links, no navigation links. The only event handler in the page is the mouse-move cursor-hide logic described in 4.5. Any accidental tap or click on the page should produce no side effect.

---

## 5. Side Effects

### Network and cache

The page initiates TanStack Query subscriptions for the party record and queue. If these subscriptions are already active (from the main party page), no redundant network call is made. If the page is opened cold, the queries run as normal fetches. No mutations are issued by this page.

### Playback SDK

The page does not initiate or control Spotify playback. It only reads playback progress state (position and duration) to drive the `PlaybackProgressBar` component. This read is passive; the playback SDK is managed by the party shell or a separate playback feature module.

### Real-time subscription

Queue changes (new votes, new tracks, track removal, track order shifts) must be reflected live on the TV screen with no user-initiated refresh. In the CrowdTune stack this is achieved by TanStack Query's `refetchInterval` or a WebSocket/SSE subscription channel established at the party shell level (separate translation concern). The TV page does not establish its own subscription; it reads from the same cache the party shell maintains. Flagged as open question OQ-1.

### Audio output

None. This page produces no audio.

### External SDKs

None directly. Spotify SDK is accessed only through the shared playback state slice, not called from this page.

---

## 6. Layout and Visual Treatment

The page is a full-viewport, overflow-hidden display with no scrollable regions. All sizing is expressed in viewport height units so that proportions are preserved across all screen sizes. The root element covers the entire viewport (position absolute, edges zero).

The base font size for the page is set to approximately 5.3 viewport height units, which makes all heading text very large relative to a normal web page - appropriate for reading from across a room.

The layout divides vertically into two named regions:

```
+----------------------------------------------------------+
|                                                          |
|   BACKGROUND (absolute, full viewport, blurred, ~30%    |
|   opacity - Ken Burns carousel or blurred cover art)     |
|                                                          |
|  +----------------------------------------------------+  |
|  |  UPPER REGION  (flex column, fills available       |  |
|  |  height, ~70% of viewport)                         |  |
|  |                                                    |  |
|  |   [Cover art square]  [Metadata block]             |  |
|  |   (~49vh x 49vh)      Track name (large)           |  |
|  |                       Artist name (light weight)   |  |
|  |                       [Progress bar strip]         |  |
|  |                       TV mode text (medium)        |  |
|  |                       [Join code badge]            |  |
|  |                                                    |  |
|  +----------------------------------------------------+  |
|  +----------------------------------------------------+  |
|  |  LOWER REGION  (flex row, ~29vh tall)              |  |
|  |   [Card1] [Card2] [Card3] ... [Card29 max]         |  |
|  |   (each upcoming track as a small vertical card)   |  |
|  +----------------------------------------------------+  |
+----------------------------------------------------------+
```

**Upper region** occupies roughly 70 viewport height units of the available height, centered vertically. It contains a horizontal flex row with the cover art square on the left and a metadata block on the right.

- The cover art square is approximately 49 viewport height units on each side, with a large soft drop shadow.
- The metadata block sits to the right with a generous left margin (approximately 8.3 viewport height units). It contains, top to bottom: the track name in large normal-weight text, the artist name in the same size but very light weight (thin font), a thin horizontal progress bar strip (approximately 0.6 viewport height units tall with vertical margin of about 4 viewport height units on each side), the party's custom TV mode text in a slightly smaller size, and a pill-shaped badge showing the party's join code.
- All text in the metadata block is single-line with overflow ellipsis; it never wraps.
- The join code badge has a semi-transparent white background, white text, and a subtle border radius. It is an inline-block element sized to its content.

**Lower region** is a fixed-height horizontal strip approximately 29 viewport height units tall, aligned to the bottom of the page. It contains the upcoming track cards side by side in a horizontal row. Each card is a vertical element approximately 19 viewport height units wide with a fixed right margin. The cards are not wrapped or scrollable; they simply extend to the right and are clipped by the overflow-hidden root.

Each upcoming track card contains:
- A square cover art image (same width as the card, with the same large soft drop shadow as the main cover art).
- A dark semi-transparent overlay covering the entire cover art.
- A vote count number centered on top of the overlay in very large text with a text shadow (this is the most visually prominent element on each card).
- The track name below the cover art in small text (approximately 1.9 viewport height units), white, single-line with ellipsis.
- The artist name below the track name in even smaller text (approximately 1.1 viewport height units), white, very light weight, single-line with ellipsis.

**No-tracks / loading / error states** replace both regions with a centered full-viewport panel. In all three non-populated states the background is plain (no blurred imagery). The panel is a centered column with:
- An icon row: either the application logo SVG (loading and empty states) or a lightning bolt emoji (error state), displayed large (logo at approximately 16 viewport height units tall; lightning bolt at approximately 12 viewport height units font size).
- A heading to the right of the icon (approximately 7 viewport height units, white, with left margin).
- One or two secondary lines below the header at the base font size.

The cursor is hidden by default on mount (the no-cursor class is applied); mouse movement reveals it and starts the hide timer.

---

## 7. HeroUI Primitive Candidates

The implementer must call `list_components` and then `get_component_docs` on the `heroui-react` MCP before deciding on primitives. The following are guidance-level suggestions, not a contract.

- **Image / Avatar**: the cover art squares (both in the upper region and on each queue card) are simple `<img>` tags with a srcset for responsive art. HeroUI v3's Image component, if available, may handle the srcset and loading states cleanly. Query `get_component_docs` for Image.
- **Spinner**: for the loading state full-viewport panel, a HeroUI Spinner centered in the panel. Query `get_component_docs` for Spinner to confirm size variants.
- **Card**: each upcoming track card in the lower strip is a visual card shape. HeroUI v3's Card compound component may be usable, though the overlay-plus-vote-count layout is unusual enough that a raw `div` stack may be simpler. The implementer should query `get_component_docs` for Card and decide.
- **Progress / Slider**: the thin playback progress bar in the upper metadata block is already handled by the shipped `PlaybackProgressBar` widget. No new primitive needed; re-use that widget directly.
- **Chip or Badge**: the join code pill at the bottom of the metadata block is a small badge-shaped element. HeroUI v3's Chip component may fit. Query `get_component_docs` for Chip.
- **No Button anywhere**: this page has no interactive buttons. Do not import Button.
- **No Modal, Drawer, Dropdown, or Input**: this page has none of these.

---

## 8. Reuse from Prior Ports

### Components to compose directly

- **`PlaybackProgressBar`** (`@/widgets/playback-progress-bar`): already shipped. The thin horizontal progress strip in the upper metadata block should be this widget, unchanged. No props changes anticipated; it reads playback state from the Zustand slice directly.
- **Queue sort logic** (`@/entities/track/lib/queue.ts`): the `sortedQueue` selector (or equivalent function) is already shipped and used by `PartyQueue`. The TV page must use the same sort - `Track.order` ascending with NaN-as-+Infinity guard, tie-break by `addedAt` lex - to ensure the track displayed as "now playing" is the same one the party host and Spotify SDK consider current.

### What the TV page does NOT use from prior ports

- **`PartyTrackRow`**: not used. TV mode's upcoming track cards have a completely different visual treatment (square cover art with overlay, vote count overlaid in large text, minimal label below). The implementer must build a new `TvTrackCard` widget or component rather than bending `PartyTrackRow` to fit.
- **`PartyQueue`**: not used. The queue layout in TV mode is a horizontal strip, not a vertical scrollable list.
- **`QueueDrawer`**: not present in TV mode. There is no navigation sidebar, settings link, or share link.
- **Party page shell header**: TV mode has no application chrome header at all.

### New sub-component: TvTrackCard

The TV mode needs a new presentational sub-component to render each card in the lower strip. This component corresponds to Festify's `tv-track.ts` companion file. It is a purely presentational, fully-controlled component that receives:

- A track identifier (provider and provider-specific ID), used to look up metadata.
- The track's vote count (an integer, displayed prominently over the cover art).
- The track's display name (a string, or null while loading).
- The artist name string (or null while loading).
- A cover art URL (or null while loading - show an empty placeholder).

In FSD terms this is a small widget or an entity UI component. Suggested placement: `@/widgets/party-tv/ui/TvTrackCard.tsx` as a private sub-component of the TV page widget, not exported from the widget's public barrel. The implementer should decide whether it warrants its own barrel (see open question OQ-4).

---

## 9. Accessibility

**ARIA roles and live regions**

The now-playing metadata block (track name, artist, progress bar) should be wrapped in a region with `role="region"` and `aria-label="Now playing"` (CrowdTune-original label - mark for product copy review). This allows screen reader users navigating by landmark to jump directly to the current track information.

The queue strip should carry `role="list"` and each card should carry `role="listitem"`. This ensures the strip is announced as a list of upcoming tracks, not an anonymous set of div elements.

The vote count displayed on each card is a decorative number in the visual design but is meaningful to screen reader users. It should have an `aria-label` such as "12 votes" rather than just "12" (CrowdTune-original label pattern - mark for product copy review).

**Live region for now-playing updates**

When the currently-playing track changes, screen reader users should be notified. An off-screen `aria-live="polite"` region should announce the new track name and artist. Something like "Now playing: [track name] by [artist]" (CrowdTune-original copy - mark for product copy review). This region should only announce on track transitions, not on every queue reorder.

**Reduced-motion handling**

Two animations are in play: the Ken Burns background carousel and the queue card flip animation. Both must be disabled when `prefers-reduced-motion: reduce` is set:

- Ken Burns carousel: instead of panning and zooming, simply display the selected background image statically.
- Queue card flip animation: instead of tweening card positions, apply the new order instantly with no transition.

The CSS `@media (prefers-reduced-motion: reduce)` query should set transition durations and animation durations to zero for both elements.

**Focus management**

This page has no interactive elements (no buttons, links, or inputs) in its populated state. Focus management is therefore not critical for the TV display itself. However, the page should not be a focus trap; if the user tabs (e.g. during setup), focus should pass through or cycle to the browser chrome without getting stuck. The root element should not have `tabIndex="-1"` applied in a way that swallows focus.

**Color contrast**

All text in TV mode is white on a dark blurred background. The semi-transparent overlay on queue cards ensures adequate contrast for the vote count and track name text above it. The implementer should verify that the overlay opacity is sufficient to meet WCAG AA contrast for the text sizes used (the vote count is large and will pass easily; the small artist name at approximately 1.1 viewport height unit may need the overlay to be slightly darker - see OQ-5).

**Cursor auto-hide**

The cursor hide behavior is purely cosmetic and has no accessibility impact. It should not affect keyboard navigation or screen reader behavior.

---

## 10. Lock-Now Decisions

**Lock-now: Route is `/party/$partyId/tv`, standalone full-viewport page.** The TV page must not render inside the party shell layout that includes the application header and queue drawer. It is its own TanStack Router route file at `apps/web/src/routes/party.$partyId.tv.tsx`, importing the page component from `@/pages/party-tv`. The route file is a thin `createFileRoute` wrapper with no business logic. Rationale: the entire point of TV mode is to fill the screen with no chrome; injecting the party shell layout would break the design.

**Lock-now: FSD placement is `pages/party-tv`.** The component sits at `apps/web/src/pages/party-tv/ui/PartyTvPage.tsx` with a public barrel at `apps/web/src/pages/party-tv/index.ts`. The `TvTrackCard` sub-component lives as a private file within the same slice (not exported). Rationale: this is a route-level page with its own data dependencies, not a widget embedded in another page.

**Lock-now: Queue strip shows tracks at indices 1 through 29 inclusive (up to 29 upcoming tracks).** The currently-playing track (index 0) is shown only in the upper region and is excluded from the strip. This slice size is sourced directly from the reference and is a deliberate UX decision: 29 is the maximum the horizontal strip can show before cards scroll off screen on a 16:9 display at the fixed card width. Rationale: locked to ensure the TV display matches guest and host expectations about what "upcoming" means.

**Lock-now: Background image starting index is computed as `trackName.length % backgroundImages.length`.** This is a deterministic, client-side calculation that ensures all TV screens in a venue show the same initial background frame for the same track, with no coordination needed. If `backgroundImages` is absent or empty, the value is null and the cover art fallback is used. Rationale: consistency across screens is a venue-facing product requirement; the deterministic formula is the right tool.

**Lock-now: ISO 8601 timestamps on the wire.** `Track.addedAt` is a string in ISO 8601 format, consistent with all prior ports. The TV page uses `addedAt` for sort tie-breaking only and does not display it. Rationale: global convention established at port 1.

**Lock-now: `spotifyUserId` field name, `provider: 'spotify'` literal, camelCase fields.** These naming conventions established by prior ports apply to any track or party data the TV page reads. No Festify snake_case field names should appear in the CrowdTune implementation. Rationale: global convention.

**Lock-now: Mouse auto-hide timeout is 3000 milliseconds.** This is the value from the reference. It is implemented as a `useEffect` with a `setTimeout`/`clearTimeout` pair, cleaned up on unmount. A `ref` stores the timeout ID to allow clearing on the next mouse-move event. Rationale: sourced directly from the reference; no reason to change it.

**Lock-now: Cursor hide is CSS-only.** Setting `cursor: none` on the page root element (via a boolean state variable that toggles a class or an inline style) is sufficient. No Zustand slice is needed for this; it is pure local state in the page component. Rationale: this is self-contained cosmetic behavior with no cross-component implications.

**Lock-now: No interactive controls whatsoever.** TV mode intentionally omits all vote buttons, skip buttons, settings links, and navigation elements. Any attempt to add "TV mode with host controls" is out of scope for this port and must not be introduced by the implementer. Rationale: the reference is unambiguous; the TV view has zero interactive elements in the populated state.

**Lock-now: `PlaybackProgressBar` widget is reused without modification.** The implementer must not duplicate the progress bar logic. Import from `@/widgets/playback-progress-bar`. Rationale: the widget is already shipped and tested; duplication would diverge.

**Lock-now: `sortedQueue` selector reused without modification.** The same sort function used by `PartyQueue` governs which track is at index 0 (currently-playing) for the TV page. Rationale: consistency between the queue list and the TV display is required; guests and the TV screen must show the same ordering.

---

## 11. Open Questions

**OQ-1: Real-time queue updates source.** The TV page needs live queue updates so the strip changes as votes shift and tracks are added or removed. The reference achieves this via Firebase RTDB's live subscription. In CrowdTune, should the TV page rely on TanStack Query's `refetchInterval` (polling), or on a WebSocket/SSE channel already established by the party shell? If the party shell's real-time channel is active when TV mode is open in a side tab, the cache is already updated. If TV mode is opened in a separate browser on a dedicated screen with no party shell open, polling is required. Decision options: (A) use `refetchInterval` of 5 seconds as a self-sufficient fallback, or (B) require TV mode to be opened from within an active party session so the shell's subscription is always available, or (C) implement a dedicated lightweight SSE subscription for TV mode. Mark for implementer + reviewer decision.

**OQ-2: Ken Burns carousel implementation.** The reference uses the `ken-burns-carousel` Web Component library. In React, there is no direct equivalent. Options: (A) implement a custom CSS animation that pans and zooms a single image with a slow `animation-duration` (no library needed), (B) use a lightweight React carousel/slideshow library that supports the Ken Burns effect, (C) display the background image statically (acceptable if reduced-motion is the default for TV installations). The implementer should evaluate whether a custom CSS-only approach is sufficient before reaching for a library. Mark for implementer decision.

**OQ-3: Queue card flip animation library.** The reference uses the `dom-flip` Web Component library for animating card position changes in the queue strip. In React, options include: (A) the `react-flip-toolkit` library, (B) `framer-motion` with `layout` prop animation, (C) CSS transitions on transform with a manual before/after position measurement hook, (D) no animation (acceptable for a first ship). The implementer should check whether `framer-motion` is already in the project's dependency tree before adding a new library. Mark for implementer + reviewer decision.

**OQ-4: TvTrackCard as private sub-component vs. separate widget.** The `TvTrackCard` sub-component (the individual card in the lower strip) is used only by the TV page. Should it live as a private file inside `pages/party-tv/ui/` (simplest), or should it be promoted to its own widget slice at `widgets/tv-track-card/` (more discoverable)? Given that it is currently only used in one place, the recommendation is to keep it private to the page slice and promote only if a second consumer emerges. Mark for implementer decision.

**OQ-5: Queue card overlay opacity for WCAG contrast.** The semi-transparent dark overlay on each queue card covers the cover art to improve legibility of the vote count and track name. The reference uses approximately 60% opacity black. The small artist name text (approximately 1.1 viewport height units) at that overlay opacity may fall below WCAG AA contrast on brightly-coloured album art. The implementer should verify with a contrast tool and increase overlay opacity if needed (70-80% is typically safe). Mark for implementer decision.

**OQ-6: TV mode text field name on the Party entity.** The upper region metadata block shows the party's custom TV mode text (a string the host sets in party settings). In the reference this is `party.settings.tv_mode_text`. The CrowdTune `Party` entity (at `@/entities/party`) may or may not already carry this field. If it is absent, the implementer must add it to the Party entity type and ensure the backend API response and OpenAPI spec include it. This is a cross-cutting change; it must be coordinated with the party-settings port (already shipped). Mark for implementer to verify before starting.

**OQ-7: Background image array field name on Track metadata.** The background Ken Burns carousel requires a `background` array field on the track's metadata object. Prior ports use a `Metadata` type that may or may not include this field. If it is absent from the CrowdTune `TrackMetadata` type, the implementer must add it and ensure the Spotify metadata enrichment layer (or equivalent) populates it. Note that the Spotify API does not natively provide background images; this field may have been populated by a third-party image service in Festify. The implementer must investigate the data source and decide whether to include background images in the first ship or defer to a follow-up task. Mark for implementer + product decision.

**OQ-8: Navigation from TV mode back to the party.** The reference provides no explicit navigation away from TV mode (the page is intentionally passive). Should the CrowdTune TV page include any escape hatch - for example, clicking anywhere or pressing Escape returns to `/party/$partyId`? The reference does not do this, but it may be useful during development or for hosts who accidentally open TV mode. Options: (A) no escape hatch (pure display), (B) a subtle opacity-zero back button that appears briefly on mouse move along with the cursor. Mark for product + implementer decision.

**OQ-9: Authentication requirement for TV mode.** The reference's TV mode is readable without any host authentication (the display is meant for guests to see). In CrowdTune, should the TV route be public (no bearer token required, visible to anyone with the URL), or should it require the same authentication as the main party route? A public TV route is simpler for the setup experience but may expose the queue to unauthenticated scraping. Mark for security reviewer + product decision.

---

## 12. Tests to Write

The implementer must write Vitest unit and integration tests covering at least the following cases:

- Renders the loading state when the queue-loaded flag is false.
- Renders the loading state when tracks exist but metadata for the currently-playing track has not yet arrived.
- Renders the error state when `partyLoadError` is non-null, and displays the error message text.
- Renders the empty-queue state when loading is complete, no error, and the queue has zero tracks.
- Renders the TV mode text from the party record in the empty-queue panel.
- Renders the populated layout when loading is complete, no error, and at least one track with metadata is present.
- Upper region displays the correct track name and artist name for the currently-playing track.
- Upper region displays the party join code in the pill badge.
- Upper region displays the correct TV mode text from the party record.
- `PlaybackProgressBar` is rendered in the upper region (presence check by component type).
- Lower strip renders no cards when the queue has exactly one track (the currently-playing track only, no upcoming tracks).
- Lower strip renders exactly 29 cards when the queue has 30 or more tracks.
- Lower strip renders exactly N-1 cards when the queue has N tracks (2 through 30).
- Each `TvTrackCard` in the strip shows the correct vote count for its track.
- Background uses the Ken Burns carousel variant when metadata includes a non-empty background image array.
- Background uses the cover art fallback when metadata has no background image array.
- Background image index is computed correctly as `trackName.length % backgroundImages.length`.
- Mouse movement makes the cursor visible and starts the hide timer.
- Mouse cursor hides after 3000 milliseconds of no movement.
- Mouse movement before the 3000 ms timeout resets the timer (cursor remains visible).
- No interactive buttons or links are rendered in the populated state.
- `prefers-reduced-motion: reduce` disables the Ken Burns animation (static background).
- `prefers-reduced-motion: reduce` disables the queue flip animation.
- The now-playing region carries `role="region"` and an accessible label.
- The queue strip carries `role="list"` and each card carries `role="listitem"`.
- Vote count on each card has an accessible label pattern like "N votes".
- Component unmounts cleanly without timer leaks (check that `clearTimeout` is called on unmount).

---

## 13. Out of Scope

The following Festify implementation details are deliberately excluded from this spec and must not be re-introduced by the implementer:

- **Polymer / lit-html custom element registration**: `view-tv` and `tv-track` are Polymer web components. CrowdTune uses React function components. No `customElements.define`, no shadow DOM, no `html` template literal tags.
- **`dom-flip` web component**: this Polymer-ecosystem library for flip animations is not available in React. The implementer must choose a React-compatible animation approach as described in OQ-3.
- **`ken-burns-carousel` web component**: same as above. The implementer replaces this with a CSS or React approach per OQ-2.
- **`ShadyCSS` polyfill check**: the reference includes a runtime check for the `ShadyCSS` polyfill (a Polymer/Edge legacy polyfill) that determines whether to use the flip animation or a plain div. CrowdTune targets modern browsers and does not need this polyfill or its detection logic.
- **Redux + reselect selectors**: `createSelector`, `mapStateToProps`, `connect` from the Polymer/fit-html/Redux pipeline are entirely replaced by TanStack Query cache reads and Zustand store hooks.
- **Firebase RTDB data shape**: snake_case field names (`short_id`, `tv_mode_text`), Firebase document key as party identifier, and real-time listener subscription via Firebase SDK are all replaced by CrowdTune's REST + TanStack Query approach.
- **`festifyLogo` SVG import and Festify branding**: the Festify logo is used in the empty and loading states. CrowdTune must use its own application logo or wordmark in these states.
- **`srcsetImg` utility**: this Polymer utility function that generates a responsive image tag with srcset attribute is replaced by standard `<img srcSet="...">` or the HeroUI Image component.
- **`sharedStyles` lit-html import**: shared Polymer styles. CrowdTune uses Tailwind 4 for all global style resets.
- **`artistJoinerFactory` selector internals**: the specific memoization strategy used in the Festify selector is an implementation detail. CrowdTune must derive artist name strings from its own `TrackMetadata` type (which already carries artist names from prior ports).
- **`domainSelector` utility**: a Festify Redux selector that reads the current domain from environment config. In CrowdTune, `window.location.origin` or an environment variable provides this where needed (relevant for the join code badge text and OQ-6 TV mode text).
- **TypeScript `window.ShadyCSS` interface augmentation**: browser-specific legacy polyfill typing, not needed.
