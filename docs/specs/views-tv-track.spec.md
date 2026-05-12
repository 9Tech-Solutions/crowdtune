# Spec: TV Track Card Component

Translation source: Festify `src/views/tv-track.ts`
Source license: LGPLv3 (Festify). This spec is clean-room prose only. No source code is reproduced.
Translation date: 2026-05-12
Status: Row card for the TV display view. Companion to the `views/view-tv.ts` translation (being specced in parallel).

---

## 1. Purpose and Placement

This component renders a single track as a compact tile on the party's ambient TV display. Unlike the queue row shown to party guests on their phones, this tile is intended to be read from a distance on a large screen. It shows the album cover art prominently in a square format, overlays the current vote count on top of the cover, and places the track title and artist credits below. There are no interactive buttons, no vote actions, no host controls, and no removal affordances. The tile is purely informational.

**Lock-now placement decision: standalone file, not a variant on PartyTrackRow.**

The TV track tile and PartyTrackRow are fundamentally different in both purpose and layout. PartyTrackRow is a horizontal list row with a small cover thumbnail (54px), text metadata, and up to five action buttons. The TV tile is a vertical card where the cover dominates the layout (large square), the vote count is overlaid on the image, and the typography below is proportionally scaled for large-screen reading. There is no trailing-actions region at all. Introducing a `variant='tv'` prop on PartyTrackRow would require conditionally suppressing all action buttons, switching from horizontal to vertical layout, resizing the cover image, and repositioning the vote count from a text label into an overlay - effectively a complete fork of the render tree behind a single prop. That violates the single-responsibility principle and makes PartyTrackRow harder to test. A dedicated `entities/track/ui/TvTrackCard.tsx` is cleaner. The FSD layer is the same (`entities/track`), so the placement is consistent with the existing row.

---

## 2. Public API - Props Contract

The component accepts exactly one external identifier. All display data is derived from shared application state using that identifier.

### External (own) props

Track identity string - required. A stable composite key identifying the track in the party queue. The format matches the convention established in the `selectors-track` spec: provider prefix plus provider-native track ID, joined without whitespace. This is the only value the parent TV view needs to pass per tile.

### Derived data read from application state

The component derives three display values from state using the track identity string as the lookup key:

**Track record** - the full queue entry for this track, including its vote count and fallback flag. May be null if the track record has not yet loaded or has been removed between list render and tile mount.

**Track metadata** - the display metadata for this track, including the title, the list of artist names, and the list of cover image objects (each image object has a URL and a pixel-width value). May be null while the metadata fetch is in flight.

**Artist display string** - a pre-formatted string joining all of the track's artist names into a single displayable line. Produced by the same `formatArtists` function already used by PartyTrackRow. Null when metadata is absent or the artist list is empty.

### Derived data NOT read from state

The component does not read:
- Party playback status (it does not show "Now playing" or "Paused").
- Authenticated user identity or host-owner status (no actions depend on it).
- Vote status labels - it shows the raw numeric vote count, not a formatted label string.

This means the TV tile is simpler to wire up than PartyTrackRow: it needs only three state slices instead of ten.

### Callbacks

None. This component emits no events and calls no callbacks. It is a pure display component.

---

## 3. Render States

There are four distinct states the tile can be in, based on the presence or absence of the track record and metadata.

**State A - Fully loaded.** Both the track record and metadata are present. The cover image is rendered using the best-fit URL from the metadata image list. The vote count from the track record is shown overlaid on the cover. The track title and artist string are shown below the cover. This is the normal operating state.

**State B - Metadata loading, track record present.** The track record exists (vote count is known) but the metadata fetch has not yet resolved. The cover area shows a placeholder block of the same dimensions. The vote count is still shown in the overlay position over the placeholder. The title line shows a loading placeholder text ("Loading..." or equivalent neutral text - CrowdTune-original copy review: confirm whether to match the existing PartyTrackRow string "Loading..." or use a skeleton element instead). The artist line is hidden entirely.

**State C - Track record loading, metadata present.** Unusual but theoretically possible if state slices arrive out of order. The cover and title render normally from metadata. The vote count overlay shows zero, because the track record (which carries the authoritative vote count) is absent.

**State D - Both absent.** The track record and metadata are both null. The cover shows a placeholder. The vote count overlay shows zero. The title shows loading text. The artist line is hidden. This is the initial flash before any data arrives.

---

## 4. Behavior

This component has no behavior in the interactive sense. It does not handle clicks, taps, keyboard events, or focus events. It renders and that is all.

The parent TV view is responsible for polling or subscribing to the party queue and passing track identity strings to each tile. The tile itself does not subscribe, does not trigger any fetches, and does not issue side effects.

When the track record's vote count changes (because a guest voted on their phone), the tile re-renders with the new count. No animation of the count change is specified; a simple numeric re-render is sufficient unless the implementer separately decides to add a number-pop animation (flag that as a non-spec enhancement in the implementation PR).

---

## 5. Layout and Visual Treatment

The tile is a vertical stack. From top to bottom:

    +---------------------------+
    |                           |
    |   [Cover image or blank]  |  <- Square block, dominant element
    |   [Vote count overlay]    |  <- Centered number on top of cover
    |   [Dark translucent layer]|  <- Always present behind the number
    |                           |
    +---------------------------+
    | Track title               |  <- Single line, truncated
    | Artist names              |  <- Single line, truncated, lighter weight
    +---------------------------+

The tile has a fixed width. The Festify reference uses approximately 204 CSS pixels as both the minimum and maximum width for the tile shell and the cover square. In our stack, this should be expressed as a fixed Tailwind width class on the tile container (for example `w-52` which is 208px, the nearest standard step). The implementer should confirm the exact pixel target by looking at the TV view spec to understand how many tiles are expected to fit horizontally on a large screen.

### Cover area

The cover is a square with the same dimension as the tile width. It is a positioned container (relative) so that the overlay and vote count can be absolutely positioned on top of the image. The cover carries a shadow to give it depth against the dark TV background (the reference uses a soft box shadow of approximately 60px spread; in our stack this is `shadow-2xl` or `shadow-[0_0_60px_0_rgba(0,0,0,0.5)]` as a one-off Tailwind arbitrary value).

When metadata is present and the image list is non-empty, render the cover image filling the full square. The image selection heuristic should match the one used in PartyTrackRow (pick the smallest image whose pixel width is at or above the rendered size, falling back to the smallest available image). The rendered size here is substantially larger than the 54px used by PartyTrackRow. Based on the tile being approximately 200px wide and the Festify reference requesting a 128px size hint from its image component, the implementer should request the smallest image at or above 200px (or 128px as a safe minimum if the 200px step is not available in Spotify's image ladder).

When metadata is absent or the image list is empty, the cover area renders an empty div filling the same space, styled with a neutral background color (the theme's default content background is appropriate).

### Dark overlay

A semi-transparent dark layer (approximately 60% opacity black) is always rendered on top of the cover image (or placeholder), below the vote count. This ensures the white vote number has contrast regardless of the cover art's colors. This overlay fills the full cover square.

### Vote count overlay

A large number is rendered centered in the cover area on top of the overlay layer. It uses white text with a text shadow for extra contrast. The typography should be substantially larger than body text - the source uses a viewport-height-relative unit (`5.556vh` approximately equals 10px per 180px of viewport height, which on a 1080p screen is roughly 60px). In our stack this should be expressed as a large Tailwind font size class. Use `text-6xl` (60px) as the starting point for a standard 1080p or large-monitor display. The parent TV view or a wrapping layout may need to scale this further for 4K. The vote count is the integer value from the track record, or zero if the track record is null.

### Title line (below the cover)

The track title is rendered below the cover in a moderately large font. The reference uses approximately `1.852vh` which on a 1080p screen is roughly 20px. Use `text-lg` or `text-xl` as the Tailwind approximation. The text is white, single line, with `truncate` overflow behavior. Top margin is a small gap from the cover block.

### Artist line (below the title)

The artist display string is rendered on a third line in a smaller, lighter font. The reference uses approximately `1.111vh` which on a 1080p screen is roughly 12px and a light font weight (`font-thin` or `font-extralight`). Use `text-xs font-thin` or `text-sm font-extralight`. Also white, single line, truncated. This line is only rendered when the artist display string is non-null.

---

## 6. Side Effects

None. This component produces no network calls, no storage writes, no audio output, and no external SDK calls. It is a pure rendering leaf.

---

## 7. HeroUI Primitive Candidates

**Cover image.** The HeroUI v3 Avatar component with `variant="soft"` for the placeholder state and `Avatar.Image` for the loaded image is the most natural fit - it already handles the fallback/loaded dichotomy and supports custom sizing. Alternatively a bare HeroUI Image component may offer more control over object-fit. The implementer must call `get_component_docs` on the `heroui-react` MCP for both `Avatar` and `Image` before deciding. Key requirement: the chosen component must render the image filling a fixed square without distortion (`object-cover` / `aspect-square`).

**Vote count overlay.** No HeroUI primitive needed. This is a plain absolutely-positioned text element inside the cover container.

**Dark overlay layer.** No HeroUI primitive needed. A plain absolutely-positioned div with a Tailwind `bg-black/60` class fulfills this.

**Tile shell.** A HeroUI Card with no internal padding or border radius may work as the outer shell. Alternatively a plain div is fine since the tile does not have hover/press affordances. If using Card, use `Card.Content` not `CardBody` (v3 compound pattern). The implementer should check whether Card introduces unwanted background or shadow that conflicts with the cover-art-flush layout.

**Title and artist text.** Plain paragraph elements are fine. No HeroUI text primitive needed.

---

## 8. Reuse from PartyTrackRow

### Props shared conceptually

The following inputs on TvTrackCard parallel inputs on PartyTrackRow:
- The track identity string (PartyTrackRow receives it indirectly through its `track` and `metadata` prop pair; TvTrackCard receives it as the single own prop that drives all derivations).
- The track record object (both components receive a nullable Track entity with the same shape).
- The metadata object (both components receive a nullable Metadata entity with the same shape).
- The artist display string (both components call the same `formatArtists` function or receive its output).

### Shared utility functions

Both components use `formatArtists` from `apps/web/src/entities/track/lib/labels.ts`. The TvTrackCard does not use `voteStatusLabel` - it renders a raw number instead.

### Cover image selection heuristic

Both components use the same heuristic: scan the image list reversed (smallest to largest) for the first image whose pixel width meets or exceeds the target render size, falling back to the smallest. The only difference is the target size. Extract this into a shared utility function (`pickCoverUrl(images: Image[], targetPx: number): string | undefined`) in `apps/web/src/entities/track/lib/cover.ts` and import it from both components. The existing PartyTrackRow hardcodes 54 as the target; generalize it to accept the target as a parameter.

### Differences from PartyTrackRow

| Dimension | PartyTrackRow | TvTrackCard |
|---|---|---|
| Layout direction | Horizontal row | Vertical card |
| Cover size | 54px square | ~200px square |
| Vote display | Text label ("2 votes", "Host pick") | Raw integer overlaid on cover |
| Artist display | Secondary text line (alongside vote label) | Separate third line |
| Action buttons | Up to five depending on role and state | Zero - none |
| Authentication props needed | Many (isOwner, hasVoted, isCompatible, etc.) | Zero |
| Playback props needed | Several | Zero |
| Callbacks | Five (onVote, onRemove, etc.) | Zero |
| Background treatment | Horizontal stripe, playing-row highlight | Uniform tile shell |
| Typography scale | Small (text-sm / text-xs) | Large (text-6xl count / text-xl title) |

These differences are extensive enough that a variant prop on PartyTrackRow would be more complex than a separate file.

---

## 9. Accessibility

### Read-only surface

Because TvTrackCard has no interactive elements, there is no need for button roles, focus management, or keyboard navigation within the tile. The tile itself does not need to be focusable.

### Image alt text

The cover image must have a descriptive alt attribute (the track title from metadata, or an empty alt if metadata is not yet loaded to avoid announcing "Loading...").

### Vote count live region

If the parent TV view wishes to announce vote count changes to assistive technology users (unlikely for a TV-mode ambient display, but worth noting), a `role="status"` or `aria-live="polite"` region on the vote count element would enable this. For the initial implementation, omit the live region because TV mode is an ambient passive display not designed for screen-reader primary use. Document this choice with a comment.

### Motion

TvTrackCard currently specifies no entry or reorder animation. If the parent TV view later adds tile reorder transitions (as tiles shift when votes change), the same `prefers-reduced-motion` guard used by the TV view's parent should be applied. The tile itself does not need to handle this independently.

---

## 10. Lock-Now Decisions

1. **Standalone file, not a variant prop.** File is `apps/web/src/entities/track/ui/TvTrackCard.tsx`. Rationale is in section 1. Do not revisit unless the TV view spec requires a different structure.

2. **No interactivity.** TvTrackCard accepts no callbacks and handles no user events. Any future feature that makes TV tiles interactive (e.g. a host "bump to top" tap on the TV display) requires a new prop and a new spec revision, not a silent addition to this component.

3. **Raw vote count, not a formatted label.** The TV tile shows the integer vote count centered over the cover. It does not use `voteStatusLabel`. When the track record is null, show zero. This matches the Festify source exactly.

4. **Zero shown for null track record.** When the track record is absent, the vote count overlay renders "0" rather than hiding the overlay or showing a dash. This avoids layout shift and is consistent with the reference behavior.

5. **Artist line hidden when null.** When `formatArtists` returns null (no metadata or no artists), the artist line is not rendered at all. Do not substitute a placeholder or empty string.

6. **Title shows "Loading..." when metadata is null.** Match the same loading text used by PartyTrackRow for consistency. If the design later adopts skeleton elements instead of loading text, change both components together.

7. **Cover image selection target is ~200px.** The implementer should pass 200 (or the tile's actual rendered pixel width) as the target to `pickCoverUrl`. This may be adjusted after the TV view spec is finalized and the exact tile dimensions are locked.

8. **Extract `pickCoverUrl` to shared utility.** Generalize the existing helper in PartyTrackRow into `apps/web/src/entities/track/lib/cover.ts` with a `targetPx` parameter. Both components import from there. This is a required refactor, not optional.

9. **No vote status label rendered.** The TV view is a scoreboard, not a status board. "Now playing", "Host pick", and "Pending" are context for someone actively managing a queue, not for a passive ambient display. Raw vote counts are more informative on a TV tile.

10. **Dark overlay always present.** The translucent dark layer is always rendered regardless of whether metadata is loaded. This ensures the vote count is always readable over any background (including the placeholder background color).

---

## 11. Open Questions

1. **Tile width - 204px or responsive?** The Festify source hardcodes 204px as both min-width and max-width. Should TvTrackCard accept a width as a prop (e.g. for different screen size breakpoints), or should it remain fixed at a Tailwind step near 200px? Decision needed from the TV view spec before implementing the tile shell.

2. **Cover image target pixel size for `pickCoverUrl`.** Spotify's image ladder for album art is typically 64px, 300px, and 640px. Requesting 200px would correctly fall through to the 300px image. Should the target be hardcoded at 300 (the next useful Spotify step above 200px), or should it remain at the rendered size (~200px) and let the heuristic pick 300px automatically? Clarify which value is more robust if Spotify ever changes its ladder.

3. **Font size strategy for large screens.** The Festify reference uses viewport-height-relative units for the vote count. Our Tailwind approach uses static size classes (`text-6xl`). On a 4K display, `text-6xl` (60px) would look undersized relative to a 204px tile. Should the TV view scale the entire tile with a CSS transform, or should TvTrackCard use `clamp()`-based Tailwind arbitrary values or a responsive size token? Decision needed before finalizing the typography.

4. **Skeleton vs "Loading..." text.** The current PartyTrackRow uses "Loading..." text when metadata is absent. The TV view is a high-production ambient display where skeleton shimmer might look more polished. Should this spec adopt a skeleton loader (for example a HeroUI Skeleton component in the title position), or keep the text placeholder to match PartyTrackRow's convention?

5. **Should the tile be marked `aria-hidden` on the TV display?** TV mode is intended for a projected ambient display, not for direct screen-reader use. If the entire TV view is meant to be decorative from an accessibility perspective, individual tiles may be marked `aria-hidden`. Confirm with product whether TV mode has any accessibility requirements.

6. **Vote count animation.** Should the vote count number animate when it changes (e.g. a brief scale-up pop)? This would require a React state comparison on each render to detect a change. Not specified in the reference; flag as a product design decision.

---

## 12. Tests to Write

Listed by test name; all should live in `apps/web/src/entities/track/ui/TvTrackCard.test.tsx`.

- Renders cover image when metadata is present with at least one image
- Renders placeholder block when metadata is null
- Renders placeholder block when metadata is present but image list is empty
- Renders vote count from track record when track record is present
- Renders zero as vote count when track record is null
- Renders track title from metadata when metadata is present
- Renders loading text when metadata is null
- Renders artist string when metadata has at least one artist
- Does not render artist line when metadata is null
- Does not render artist line when artist list is empty
- Overlay is present when metadata is loaded
- Overlay is present when metadata is null (ensures vote count is always readable)
- Cover image alt text equals track title when metadata is present
- Cover image alt text is empty string when metadata is null
- Does not render any button or interactive element in any state
- Re-renders with updated vote count when track record vote count changes

---

## 13. Out of Scope

The following Festify-specific concerns do not translate to our stack and should not appear in the implementation:

- Polymer `custom elements` registration or Shadow DOM encapsulation.
- The `fit-html` rendering pipeline and `connect`/`withFit` wrappers.
- The `srcsetImg` helper component (replaced by `pickCoverUrl` utility + a standard img or HeroUI Avatar).
- The `artistJoinerFactory` memoized selector factory (replaced by a plain call to the already-shipped `formatArtists` function).
- Viewport-height-relative CSS units (`vh`) in the Festify inline styles (replaced by Tailwind static or responsive size classes, with open question 3 flagging the scaling concern).
- Festify CSS class names (`.cover`, `.overlay`, `.empty`).
- The `mapStateToPropsFactory` Redux connection (replaced by deriving state from TanStack Query cache in the parent TV view and passing resolved props to the tile).
