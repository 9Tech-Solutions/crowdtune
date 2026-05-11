# Spec: Playback Progress Bar Widget

Translation source: Festify `views/playback-progress-bar.ts`
Translation date: 2026-05-11
Status: Sixth UI port. This widget is the slim horizontal fill strip anchored to the bottom edge of the fixed party header. In the current CrowdTune codebase it is represented by an empty placeholder div called `PlaybackProgressBarSlot` inside `apps/web/src/pages/party/ui/PartyPage.tsx`. This spec describes the behavior that replaces that placeholder.

---

## 1. Purpose

This widget renders a slim horizontal progress strip that visually communicates how far through the current track the party's playback has advanced. It sits anchored to the bottom edge of the party page's fixed header bar, spanning the full header width, so that guests arriving at the party can glance at the strip and immediately understand the track's progress without reading any numbers. The strip fills from left to right proportionally: a completely left-aligned strip means the track just started, a completely filled strip means the track is ending. The strip is frozen when music is paused and advances smoothly when music is playing.

---

## 2. Public Contract

### 2a. Inputs (props)

This component is fully controlled. It receives all data it needs from its parent and performs no store reads of its own.

| Prop | Type | Required | Valid values and meaning |
|---|---|---|---|
| Playback object | The `Playback` entity type already shipped at `@/entities/party`, or null | No (nullable) | When null the strip renders at 0%. When present, the `playing` boolean, the `lastPositionMs` number (milliseconds of playback elapsed at the moment of the last state change), and the `lastChange` ISO 8601 timestamp (the wall-clock moment when the last state change was recorded) are all consumed. The `masterId`, `targetPlaying`, and any other fields on the Playback entity are not consumed by this widget. |
| Duration in milliseconds | Number, or null | No (nullable) | The full playback length of the current track in milliseconds. When zero, negative, or null, the strip renders at 0% and does not animate. |

The already-shipped `Playback` type from `@/entities/party` is sufficient to supply the playback fields this widget needs. No new entity fields are required.

### 2b. Outputs and events

This widget emits no events. It is a pure display component with no interactive controls. The parent receives no callbacks from it.

### 2c. State observed

The widget observes only the two props described in section 2a. It reads wall-clock time internally (via the browser's timestamp mechanism) in order to compute how much time has elapsed since `lastChange`. It reads no Zustand slice, no TanStack Query cache, and no Firebase or Postgres data directly.

### 2d. State mutated

The widget mutates no external state. All internal state (the animation frame handle, the computed display percentage) is local to the component and cleaned up on unmount.

---

## 3. Behavior

### Startup and initial render

When the widget first mounts, it performs an immediate computation of the current display percentage using the props available at mount time. This prevents a flash of 0% before the first animation frame fires.

### Position derivation

The displayed fill percentage is derived from two values: the elapsed position in milliseconds and the track's total duration in milliseconds. The elapsed position depends on whether playback is active:

When the `playing` flag on the Playback object is true, the elapsed position is computed as the sum of `lastPositionMs` and the number of milliseconds that have elapsed since the `lastChange` timestamp (that is, the difference between the current wall-clock time and the parsed `lastChange` timestamp). This gives a continuously-advancing position without requiring a server round-trip on every frame.

When the `playing` flag is false, the elapsed position is exactly `lastPositionMs` with no wall-clock addition. The strip is frozen.

The display percentage is the ratio of the elapsed position to the duration, clamped to the range zero through one (inclusive). At zero percent, the strip shows as a completely unfilled line. At one hundred percent, the strip is fully filled.

### Animation strategy

The source uses a CSS transform (horizontal scale applied from the left origin) combined with a CSS transition to produce smooth motion. The implementation approach is as follows:

When `playing` becomes true (or the widget mounts while already playing), the widget performs two sequential animation frame requests. In the first frame, the strip is positioned instantaneously (with zero-duration transition) at the computed current percentage. This resets any prior transition state so the compositor starts from a known position. In the second frame (which fires in the next compositor cycle after the first has been committed), a linear CSS transition whose duration equals the remaining time in the track is started, targeting 100%. The strip then glides to 100% under CSS control without any JavaScript timer needing to fire again mid-track.

When `playing` is false (or becomes false while the animation is running), the strip is set to the `lastPositionMs`-derived percentage with zero transition duration and no ongoing transition. No animation frames are queued.

This two-frame approach is a deliberate workaround to give the browser compositor one cycle to reset transition state before the new long-duration transition begins. The implementer must replicate this sequencing; a single frame or a `setTimeout` of zero is not equivalent.

### Visual appearance

The strip spans the full width of its containing element. Its height is very small - the source uses 1 pixel. At the 0% state the fill element is present in the DOM but occupies negligible width (a `scaleX(0)` transform is applied, keeping the element in layout flow at zero visual width rather than removing it from the DOM). The fill element does not collapse the host's layout when empty.

The fill element's opacity is reduced (to approximately 50%) when the party is paused, and fully opaque when playing. This gives a visual cue distinguishing the frozen-paused state from the advancing-playing state without hiding the strip entirely.

The color of the fill is a light neutral (white in the source). In our stack, this should follow HeroUI's theme token for the header foreground so it remains legible against the header background color in both light and dark modes.

### Guard conditions - no render or zero fill

When the Playback prop is null, or when the duration prop is null, zero, or negative, the widget skips the position computation and positions the fill at 0% with no transition and 0% opacity (effectively invisible but still occupying the layout slot). It does not unmount or display nothing; the host element remains in the DOM at its fixed height to avoid layout shift in the parent header.

### Accessibility

The host element carries the ARIA progress-bar semantics:

- `role="progressbar"` on the host element so assistive technology recognizes it as a progress indicator.
- `aria-valuemin` is `0` and `aria-valuemax` is `100`. The widget normalizes the fill percentage to this 0-100 scale rather than to the raw `durationMs` value, so screen readers report a stable familiar range.
- `aria-valuenow` reflects the current display percentage rounded to the nearest integer. **`aria-valuenow` is updated at most once per second**, NOT on every animation frame. Updating on every frame would flood assistive technology with announcements and degrade the experience. The implementer wires a low-frequency interval (or a coarsened tick derived from the playing computation) that writes the rounded percentage to `aria-valuenow`; the visual fill animation still uses the smooth CSS-transition path described above and is independent of the ARIA update cadence.
- `aria-label` text is CrowdTune-original: "Track playback progress" (the implementer should treat this string as proposed copy and may rephrase if product requests it). The label is fixed; it does not include the current percentage.
- When the Playback prop is null or duration is unknown, `aria-valuenow` is omitted (the host still carries `role="progressbar"` so the strip's role is announced, but no value is reported).

---

## 4. Side Effects

### Animation frame registration

When `playing` is true, the widget registers two sequential animation frame callbacks. These callbacks manipulate the CSS transition and transform of the fill element. No network call is made. No Zustand slice is written. No TanStack Query mutation is fired.

### Cleanup on unmount

When the widget unmounts, any pending animation frame handles are cancelled. This prevents the callback from referencing a DOM element that no longer exists.

### No network, storage, or SDK calls

This widget performs zero network requests, zero localStorage reads or writes, and makes no calls to the Spotify Web Playback SDK, Firebase, Sentry, or any other external service.

---

## 5. Edge Cases Worth Preserving

- **Playback null on mount**: the strip renders at 0% with no animation. If the Playback object arrives later (due to async data loading in the parent), the component re-renders with the new props and begins the two-frame animation startup sequence at that point.
- **Duration zero or null**: the strip renders at 0% with no animation. Division by zero is prevented by the guard condition check before any percentage computation.
- **Track switches mid-animation**: when the duration prop changes (a new track started), the component re-runs the two-frame startup sequence from the beginning, anchoring to the new `lastPositionMs` against the new duration. No stale animation continues.
- **Playback pauses mid-track**: the ongoing CSS transition is cancelled by applying a zero-duration transition targeting the current computed percentage. The strip freezes at the paused position. The opacity drops to the paused level.
- **Playback resumes after pause**: the two-frame sequence fires again, computing the new elapsed position from the updated `lastPositionMs` and `lastChange` fields in the incoming Playback prop, and a new linear transition targeting 100% over the remaining duration is started.
- **Track finishes (position reaches 100%)**: the CSS transition naturally reaches its target of 100% fill. No JavaScript timer fires at that point. The strip stays at 100% fill until the parent supplies a new duration and playback object for the next track, at which point the strip resets to the new computed position. There is no automatic reset to 0% performed by this widget itself; the reset depends on the parent providing new props.
- **Rapid prop updates**: if the parent delivers many consecutive prop updates (for example, polling at a short interval), the two-frame sequence is restarted on each update when playing. This is safe because the first frame of each sequence resets the transition state before the second frame starts the long animation. The implementer should ensure that prop changes that do not alter the effective computed position (for example, a `lastChange` update that results in the same percentage due to rounding) do not cause a visible jump; this can be achieved by comparing the computed percentage before deciding whether to restart the sequence.
- **Component mounts while paused**: the strip renders at the `lastPositionMs` percentage with zero transition and reduced opacity. No animation frame is queued.
- **Very short tracks (duration under one second)**: the strip fills almost immediately. This is correct and expected behavior.

---

## 6. Open Questions for the Implementer

1. **HeroUI ProgressBar vs hand-rolled fill div**: HeroUI v3 ships a ProgressBar component. The implementer must call `mcp__heroui-react__get_component_docs` for `ProgressBar` (and any closely related primitive such as a Meter) before deciding. The key question is whether HeroUI's ProgressBar can be constrained to a 1-2 pixel height with no label text, no number readout, and a custom CSS transition duration set programmatically per-frame. If the component API does not support programmatic transition-duration overrides on the fill element, a hand-rolled div with Tailwind utilities and an inline style for the transform is the appropriate fallback. Do not assume HeroUI fits without consulting the MCP.

2. **Behavior when the track ends**: the source leaves the strip at 100% fill indefinitely after the CSS transition completes, relying on the parent to provide new props when the next track starts. Confirm with product whether CrowdTune should replicate this (stay at 100%) or reset to 0% immediately when the computed position exceeds duration. The source's behavior is "stay at 100%"; document the chosen behavior in the implementation PR.

3. **Reduced-motion preference**: the source animates the strip via a long-duration CSS transition. When the user has enabled the `prefers-reduced-motion: reduce` media query, the visual change is very small (a 1-2px strip advancing slowly), so the motion is unlikely to cause distress. However, strictly conforming to the media query would mean applying the strip position immediately (zero transition duration) rather than animating. Confirm whether CrowdTune should respect `prefers-reduced-motion` for this strip or treat the slow linear fill as below the threshold of concern.

4. **Initial render before duration is known**: if the parent mounts the widget before the current track's duration is available (because the track metadata fetch is still in flight), the strip renders at 0% height slot but is invisible (0% fill, reduced opacity). This preserves the layout slot so the header does not shift when the duration arrives. Confirm with the team that this zero-fill placeholder behavior is acceptable and that the header layout accounts for the 1-2px height reservation even when the data is absent.

5. **Opacity value for paused state**: the source uses approximately 50% opacity for the paused fill. Confirm the exact opacity value or HeroUI token to use so it matches the party header's visual design system.

---

## 7. Stack Mapping Notes

### Locked decisions for CrowdTune

- **Component shape**: React function component, fully controlled. The component signature accepts two props: a nullable Playback entity and a nullable duration number. It performs no Zustand reads, no TanStack Query calls, and no direct Spotify or Firebase interactions. This mirrors the PartyTrackRow and PartyQueue patterns already shipped.

- **Re-render and animation strategy**: the two-frame `requestAnimationFrame` sequence described in section 3 runs in response to the four observed inputs changing - the `playing` flag, the `lastPositionMs` and `lastChange` fields, and the duration. When `playing` is true the widget triggers the two-frame sequence and arranges for both frame handles to be cancelled before the next sequence starts (or on teardown). When `playing` is false the widget applies the frozen position immediately, with no animation frames queued. The browser's CSS transition engine drives the visual fill between the two frame anchors; the widget itself does not run a JS timer or polling loop while the track is advancing.

- **DOM manipulation approach**: the widget needs to write inline CSS transition durations and transforms at sub-frame granularity. State updates that go through reconciliation would not deliver the frame-accurate timing the two-frame trick requires, so the widget holds a stable reference to the fill element's DOM node and writes the relevant style properties directly to it (transition timing function, transition duration, and the scale-X transform). This is the only correct approach for the compositor-driven CSS animation pattern described in section 3; the React state mechanism is not used to drive the animation.

- **FSD placement**: the widget is placed at `apps/web/src/widgets/playback-progress-bar/ui/PlaybackProgressBar.tsx` with a public barrel at `apps/web/src/widgets/playback-progress-bar/index.ts` exporting the component. The widget layer is appropriate because the strip is a composed UI concern (it computes time arithmetic and manages animation) that is reusable outside a single page, even though in practice only PartyPage consumes it today. Entity layer is too low (the component has animation side effects); feature layer is too narrow (it has no mutation or user interaction). Widget layer is the correct FSD home.

- **PartyPage integration**: once this widget ships, `PartyPage.tsx` replaces the `PlaybackProgressBarSlot` empty placeholder div with `<PlaybackProgressBar playback={playback} durationMs={durationMs} />`. The `playback` value comes from the party entity in the TanStack Query cache (already wired at the page level). The `durationMs` value comes from the current track's metadata (also available at the page level from the queue query). The widget does not fetch either value itself.

- **No internal TODO comments**: the implementation must not contain `// TODO` comments. All open product questions are captured in section 6 of this spec and resolved before the implementation PR is opened or tracked as a follow-up issue.

### Framework translation

- The source's custom-element lifecycle maps to a React function component with an animation effect and a stable DOM reference for the fill element. The component does not register a web component; it is a plain React JSX node consumed by PartyPage.
- The source reads the current track's duration from a global state layer keyed by the current track ID, and reads the Playback object from a separate global state slice. In CrowdTune both values arrive as the two props described in section 2a; PartyPage derives them from the TanStack Query cache (the queue query + the playback query) and passes them down. No global store reads happen inside the widget.
- The source's scoped stylesheet maps to Tailwind utility classes on the host and fill elements, plus an inline style for the programmatically-set transform value. No CSS modules or styled-components are needed.
- The source's derived duration selector (which looked up the current track's duration from a metadata map keyed by the current track ID) maps to a straightforward field read at the parent level, since TanStack Query already caches the current track's metadata. This is not a separate selectors task; it is a single field read at the PartyPage level.

### Dependencies

- `Playback` entity type from `@/entities/party` - already shipped. No new fields needed.
- No new entity types are introduced by this widget.
- The widget is consumed by `apps/web/src/pages/party/ui/PartyPage.tsx` which holds the `PlaybackProgressBarSlot` placeholder. The slot stays in place until this widget ships and the import is wired.
- The `currentTrackIdSelector` and `metadataSelector` concepts from the source (separate translation tasks) do not need to be ported as selectors in our stack; the parent page derives the current track's duration directly from the TanStack Query cache using the current queue state. Document this in the PartyPage integration PR so the team does not create a redundant selector utility.
