# Spec: Search Bar Sub-Component

Translation source: Festify `views/search-bar.ts`
Translation date: 2026-05-12
Status: Overlap analysis against existing `PartyTrackSearch` widget (shipped at commit ef69bdb). Recommendation: skip as a standalone port - redundant with what is already implemented.

---

## 0. Relationship to Existing PartyTrackSearch Port

### What `views/search-bar.ts` actually does

In the Festify codebase, `search-bar.ts` is a narrow, presentational sub-component responsible for exactly one thing: rendering a single-line text input with an icon on its left side. When the input is empty, the icon is the Festify brand logo. When the input contains any text, the icon becomes a back-arrow button; tapping that back-arrow clears the text and erases the search query from the URL. The component reads the current search query string from a single URL query parameter and dispatches exactly two actions to a global store - one to update the typed text character by character, and one to reset the text to empty. It has no knowledge of search results, no loading states, no result rows, and no add-to-queue affordance. Its responsibility is limited to capturing text input and surfacing a clear/back affordance when text is present.

The component is visually a fixed-height card-style bar with a subtle shadow. It was always designed to be embedded inside a larger view (the party track search view), not to function as a standalone route-level page.

### Behaviors already covered by the existing PartyTrackSearch widget

The `PartyTrackSearch` widget shipped in CrowdTune already subsumes every behavior that `search-bar.ts` provided, plus the full surrounding search experience:

- A text input field that captures the user's query on every keystroke. Fully covered by the HeroUI `Input` component inside `PartyTrackSearch`.
- A debounce mechanism that delays committing the search query to the URL until the user stops typing. Covered by the 300 ms debounce timer in `PartyTrackSearch`.
- The ability to clear the text and reset the URL query parameter. Covered by the Escape key handler in `PartyTrackSearch`, which clears local state and removes the URL parameter in a single operation.
- Reading the initial query from the URL on mount so that back-navigation restores the prior search text. Covered by `PartyTrackSearch` seeding its local state from the URL search parameter on mount.
- Committing the query immediately on Enter rather than waiting for the debounce. Covered by the Enter key handler in `PartyTrackSearch`.
- Auto-focus of the input on mount. Covered by the `useEffect` that calls `focus()` on the input reference in `PartyTrackSearch`.

### Behaviors that would be NEW or DIFFERENT if ported as its own widget

There is exactly one presentational detail in `search-bar.ts` that the existing `PartyTrackSearch` widget does not replicate:

- The left-side icon swap: when the query is empty the brand logo is shown; when the query is non-empty a back-arrow button appears and, when pressed, clears the input. The existing `PartyTrackSearch` widget uses only the HeroUI `Input` component with no leading icon, and its clear affordance is keyboard-only (Escape key). A back-arrow button that is tappable on mobile and visible at all times when text is present would improve mobile usability.

There are no other behaviors, state interactions, or side effects in `search-bar.ts` that are absent from the current implementation.

### Recommendation

**(b) Extract a subcomponent of PartyTrackSearch and skip a new widget.**

The only gap is the leading icon swap (logo vs. back-arrow button). This should be addressed as an enhancement to the existing `PartyTrackSearch` widget by adding an `startContent` or equivalent leading-slot prop to the HeroUI `Input`, or by wrapping the input in a container that renders either a branding mark or a clear button on the left depending on whether the local query string is empty. Do not create a new `SearchBar` widget; the abstraction boundary provided by `search-bar.ts` in Festify was a Polymer-specific concern and does not translate meaningfully to a React component tree in FSD.

---

## 1. Purpose

This component solves the problem of capturing the user's track search text within a party session. It provides a persistent, visually prominent text field at the top of the search view so guests can type a song title, artist name, or album name. While the user is typing, a brand mark on the left side of the field anchors the visual identity of the interface. Once the user has entered any text, the brand mark is replaced by a tappable back-arrow that lets the user cancel their search in a single tap and return to the idle state, clearing both the local input and the URL query. The component owns only input capture and the clear affordance; it has no awareness of results, loading states, or playback.

---

## 2. Public Contract

### 2a. Inputs

The search bar sub-component receives the following from its parent:

| Input | Type | Required | Description and valid values |
|---|---|---|---|
| Current search text | String | Yes | The text currently held in the global query state, read from the URL query parameter that represents the search string. Empty string when no search is active. Drives both the displayed value in the input and the left-icon decision. |
| On-text-change callback | Function | Yes | Called with the full new string value on every input event (every keystroke). The parent is responsible for debouncing before writing to the URL. |
| On-erase callback | Function | Yes | Called with no arguments when the user activates the back-arrow clear button. The parent is responsible for clearing the URL query parameter and resetting any associated search state. |

### 2b. Outputs, events, and responses

- The component renders a horizontally laid-out bar with a leading icon zone and a text input occupying the remaining width.
- When the text value is empty: the leading zone displays a static brand mark (the application logo or a search icon acting as a brand anchor). (Mark for product copy review: the Festify reference uses the Festify logo here; CrowdTune should substitute its own brand mark or a generic magnifying glass icon.)
- When the text value is non-empty: the leading zone displays a tappable back-arrow icon button. Tapping it fires the on-erase callback.
- On every keystroke in the input field: the on-text-change callback is invoked with the current full string value.
- No DOM events are propagated to ancestors beyond the two callbacks above.

### 2c. State observed

- **Search query string from the URL**: the component reads the single URL query parameter representing the active search text (the parameter is named `s` in Festify; the CrowdTune equivalent is `q` per the existing implementation). This is the only external state the component observes. It does not subscribe to party data, user identity, or queue state.

### 2d. State mutated

The component itself mutates no external state directly. All state changes flow outward through the two callbacks. The parent view owns the URL write and the store/query-param write.

---

## 3. Behavior

When the component mounts, it displays whatever text the parent provides as the current query. If that text is empty, the left icon zone shows the brand mark. If it is non-empty (for example, because the user navigated back from the results and the URL still carries a query), the left icon zone shows the back-arrow.

As the user types, each keystroke triggers the on-text-change callback synchronously with the full updated string. The component does not debounce internally; debouncing is the parent's responsibility. The displayed input value updates immediately on each keystroke so the user sees their keystrokes reflected with no lag.

When the input string transitions from empty to non-empty (after the first character is entered), the left icon zone replaces the brand mark with the back-arrow button. This swap happens reactively as the text value changes; there is no animation or delay specified.

When the input string transitions from non-empty back to empty (all characters deleted by the user via backspace), the left icon zone reverts to showing the brand mark.

When the user clicks or taps the back-arrow button, the on-erase callback fires. The component does not manage any local state for the text; it is fully controlled by the parent. After on-erase fires, the parent is expected to set the query to empty, which will cause the next render to revert to the brand mark on the left.

There is no submit event, no Enter-key handler, and no keyboard shortcut defined within this component. All such behaviors live in the parent view.

---

## 4. Side Effects

None. This component performs no network calls, no storage reads or writes, no audio operations, and no calls to external SDKs. It is a pure presentational input widget. All side effects (URL writes, store dispatches) are delegated to the parent through callbacks.

---

## 5. Edge Cases Worth Preserving

**Empty initial text on fresh mount**: when the party search view is opened for the first time with no prior query, the input must be empty and the brand mark must be visible. The component must not show a stale or undefined value.

**Non-empty initial text on back-navigation**: when the user navigates back from a results view that had an active query, the parent provides the prior query string as the initial text value. The component should render the back-arrow immediately (not the brand mark) because text is already present, and the input should display the full prior query.

**Rapid clearing via the back-arrow while a debounce is in flight in the parent**: if the user types a few characters and then immediately taps the back-arrow before the parent's debounce timer fires, the on-erase callback must fire. The parent must cancel any pending debounce timer when it receives on-erase. This is a parent-side concern, not a concern of this component itself, but the spec flags it because it is an ordering hazard.

**Accessibility**: the input must have an accessible label. Because the component has no visible label text (the placeholder serves as guidance only), an `aria-label` attribute is required on the input element. (Mark for product copy review: suggested label "Search for tracks" - verify with the product team.) The back-arrow button must also have an accessible label. (Mark for product copy review: suggested label "Clear search" - verify with the product team.)

**Touch targets**: the back-arrow button must meet minimum touch target size requirements (44x44 CSS pixels or equivalent) for mobile guests.

---

## 6. Open Questions for the Implementer

**Q1 - Whether to port at all**: the recommendation in section 0 is to enhance `PartyTrackSearch` rather than create a new widget. Before starting any work, confirm with the product owner whether the back-arrow / brand-mark icon swap is a desired feature for CrowdTune's party search experience. If the team decides a plain HeroUI `Input` with no leading icon is acceptable, this entire spec can be closed as "skip".

**Q2 - Brand mark identity**: Festify used its own logo SVG as the leading icon. CrowdTune must decide whether to use its own logo, a generic music note, or simply a magnifying glass icon in that slot. Flag for product copy review.

**Q3 - Back-arrow vs. clear button**: the Festify design uses a directional back-arrow, which implies "go back" rather than "clear text". In a non-navigational context (the input is not a separate page in CrowdTune's routing model), an "X" clear button is more conventional and matches HeroUI's `Input` component's built-in `isClearable` prop. The implementer should evaluate whether `isClearable` on the HeroUI `Input` fully satisfies this requirement, which would make the custom leading-icon swap unnecessary. Flag for review before implementation.

**Q4 - Controlled vs. uncontrolled**: if HeroUI's `Input` `isClearable` prop is used, confirm that the clear event fires the equivalent of on-erase and clears the URL parameter in the parent, not just the local display value. The URL and the local state must stay in sync.

**Q5 - Icon zone width on small screens**: the fixed-size icon zone in the Festify reference (24px icon with fixed margin) may not translate well to all viewport sizes. The implementer should verify the layout with HeroUI's `Input` `startContent` slot and confirm the tap target is adequate on mobile.

---

## 7. Stack Mapping Notes

This component would map to CrowdTune's stack as follows if it were ported (for context, even though the recommendation is to enhance the existing widget instead):

- The Polymer custom element `search-bar` maps to a React function component, not a class.
- The two Redux store actions (change text, erase text) map to callbacks passed as props from the parent widget. No Zustand store slice is needed for the text itself; the source of truth is the URL search parameter `q`, already managed by `PartyTrackSearch`.
- The `input` HTML element with inline event binding maps to a HeroUI `Input` component. The implementer must call `get_component_docs` on the `heroui-react` MCP for `Input` before building, specifically to confirm the `startContent` slot API and the `isClearable` prop behavior in v3.
- The back-arrow icon button maps to a HeroUI `Button` with `variant="ghost"` and an icon child, or to the `Input`'s built-in clear affordance if the `isClearable` prop is used instead.
- The brand logo SVG maps to an `img` or inline SVG component sourced from `@/shared/assets`. Creating a new shared asset is a separate task.
- The Festify global Redux store slice that holds the URL query parameter (`state.router.query.s`) maps to `useSearch` from TanStack Router, already used in `PartyTrackSearch` as the `q` parameter.
- There is no Firebase, no Gin handler, no Postgres table, and no background job involved in this component. It is pure UI.

**Dependencies on other translation tasks**: this spec depends on the `PartyTrackSearch` widget (already shipped, commit ef69bdb) and the `actions/view-party` module (the `changeTrackSearchInput` and `eraseTrackSearchInput` actions), which map to the URL navigation calls already present in `PartyTrackSearch`. No separate translation task is needed for those actions.
