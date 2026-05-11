# Spec: Party Page Shell

Translation source: Festify `views/view-party.ts`
Translation date: 2026-05-11
Status: Fourth UI port. This is the first page-level port from Festify. It is a page shell that composes the QueueDrawer widget, a fixed app-bar header region, and a slot for the currently active sub-view (queue, search, settings, or share). It also owns a sign-in modal that can appear over the entire page. It is NOT a routing host in the TanStack Router sense; it is the rendered body of the `/party/$partyId` route family, managing which sub-view widget occupies its main content region based on the active URL segment.

---

## 1. Purpose

This page serves as the top-level chrome for an active party session. Every user who has joined or is visiting a party lands here. The page is always visible while the user is inside the party and is responsible for holding together the three persistent structural concerns: the navigation drawer (the `QueueDrawer` widget), the fixed header strip at the top of the screen showing the party name and a search input, and the main scrollable content area where the active sub-view (queue list, search results, settings panel, or share panel) renders.

The page also owns a sign-in modal dialog. When the party host has enabled a setting that requires guests to authenticate before voting, the page detects that a sign-in is needed and opens the modal. The modal presents one button per identity provider currently enabled in our Neon Auth configuration at runtime - the spec does NOT enumerate a fixed provider list because our enabled-provider set is a deployment-time decision read from the auth client. (Note: per `~/.claude/projects/.../memory/project_neon_auth.md`, Spotify is NOT a built-in Neon Auth social provider; do NOT include a Spotify button in this list even if Festify had one. Spotify is wired through our separate Phase 9 endpoints, not through Neon Auth's social sign-in.) This modal is not owned by any sub-view; it is a page-level concern that can appear regardless of which sub-view is active.

No business logic for data mutation lives here. The page loads party data and playback data, passes the relevant slices down to the widgets and sub-views, and forwards user-action callbacks from those widgets up to the feature layer.

---

## 2. Public Contract

### 2a. Inputs (route binding and props)

The page is bound to a route of the form `/party/:partyId` (in our stack, a TanStack Router file-based route such as `src/routes/party.$partyId.tsx`). The party identifier is read from the URL via TanStack Router's `useParams` hook - it is not passed as a React prop from a parent component.

There is no additional search-param or hash input that the page shell itself consumes. Sub-views may read their own search params (for example, the search sub-view may read a query string), but those are concerns of the individual sub-view components, not of this shell.

Because the page reads its own data rather than receiving it as props, the public prop surface of the shell component is narrow:

| Input | Type | Required | Notes |
|---|---|---|---|
| None from parent | - | - | The page is a route-level component. It receives no props from a parent React component. All data is obtained internally via TanStack Query hooks and the Neon Auth session hook. |

From the perspective of the TanStack Router route binding, the route receives `partyId` as a path parameter (a non-empty string). The route file at `src/routes/party.$partyId.tsx` extracts this parameter and provides it to the page component via `useParams`.

### 2b. Outputs and events emitted

The page shell does not emit custom DOM events or call parent callbacks. It is the top of the in-party component tree. All outward effects are expressed as:

- Navigation transitions (via TanStack Router's navigate function, triggered by user interaction with the QueueDrawer or empty-state links).
- Mutations to the API (vote, remove, toggle playback, transfer playback), which flow from the feature layer invoked by the widgets, not from the page shell directly.
- Analytics events (if present - see section 4).

### 2c. State observed (read from application state)

The page shell reads the following categories of state, either from TanStack Query cache or from the Neon Auth session:

- **Party data**: the party record for the current party identifier. Includes the party name, the host's user identifier, and the configuration flags (such as whether sign-in is required to vote). The page uses the party name to populate the header title region.
- **Sign-in modal visibility**: a page-local boolean that tracks whether the sign-in modal is currently open.
- **Sign-in mode** (normal vs. follow-up): a flag indicating whether the sign-in prompt is asking the user to authenticate for the first time (normal sign-in) or to re-authenticate with a previously linked provider because a follow-up link step is required (follow-up sign-in). This state is owned by the auth layer and read here to determine which heading and copy to display inside the modal.
- **Enabled identity providers**: a map of which OAuth providers are currently enabled for the party. When in follow-up sign-in mode, only the providers linked to the existing account are enabled; in normal sign-in mode, all providers are enabled. The modal uses this to decide which provider buttons are active vs disabled.
- **Current sub-view**: derived from the active URL segment. One of the values in the sub-view enumeration described in section 3 below.
- **User session**: the current authenticated user's display name (used to populate the QueueDrawer's username prop). Obtained via the existing `@/shared/auth/auth-client.ts` session hook.

### 2d. State mutated

- **Sign-in modal open state**: the page shell toggles this page-local boolean open (when the auth layer signals that sign-in is required) and closed (when the user dismisses or cancels the modal).
- **Drawer open state**: the page shell toggles this page-local boolean when the user taps the hamburger icon in the header or when the QueueDrawer reports a close event.
- No party data, track data, vote data, or playback data is mutated directly by the shell. Those mutations flow through the feature layer.

---

## 3. Behavior

### On mount

When the page component mounts, it uses the party identifier from the URL to initiate a subscription to party data. In our stack this is a TanStack Query fetch (with polling or, if the implementer chooses, a WebSocket subscription - see section 6). The party data is used to:

1. Display the party name in the header.
2. Determine whether the current user is the party host (which controls host-only affordances in sub-views and the QueueDrawer).
3. Determine whether guest sign-in is required (which may trigger the sign-in modal).

The page also initiates a subscription to playback data for this party on mount. Playback data feeds into the sub-views and the PartyQueue widget. The page passes these as props/context to the relevant widgets.

### Layout regions (always mounted)

The page maintains these structural regions at all times, regardless of which sub-view is active:

**Drawer region**: the `QueueDrawer` widget is always mounted. On narrow viewports (mobile), it is hidden off-screen to the left and slides in when the drawer is open. On wide viewports (desktop), it is pinned to the left side of the page and permanently visible; the hamburger toggle button in the header is hidden on wide viewports because the drawer is always open. The `isDrawerOpen` boolean controls drawer visibility and is toggled by the hamburger icon tap and by the QueueDrawer's own close affordances.

**Header region**: a fixed strip at the top of the viewport, positioned above the main content area. On narrow viewports it spans the full screen width; on wide viewports it is offset to the right of the permanent drawer (starting from the drawer's right edge, currently defined as 256 logical pixels). The header contains:
- A hamburger (menu) icon button on the left, shown only on narrow viewports.
- The party name as a centered title.
- A search input bar immediately below the toolbar row.
- A playback progress bar anchored to the bottom edge of the header strip. This bar shows the playback progress of the currently playing track. It is a visual element only; its corresponding Festify source file is a SEPARATE translation task not yet completed. The spec describes its position in the layout but does not translate its internals.

**Main content region**: a vertically scrollable area that renders the currently active sub-view. The content is offset from the top of the viewport by the height of the fixed header (so it does not render behind the header). The sub-view rendered in this region changes based on the active URL segment.

### Sub-view selection

The page derives the active sub-view from the current URL. When the current route is the queue route (the default party path, e.g. `/party/$partyId`), the `PartyQueue` widget is rendered in the main content region. When the route matches one of the sub-routes (`/party/$partyId/search`, `/party/$partyId/settings`, `/party/$partyId/share`, `/party/$partyId/tv`), the corresponding sub-view component is rendered instead.

The active sub-view identifier is passed to the `QueueDrawer` as its `currentSubView` prop (one of `'queue' | 'search' | 'settings' | 'share' | 'tv' | null`) so the drawer can highlight the active navigation link. This value is derived from TanStack Router's active route matching, NOT from any Zustand slice or local state variable.

The sub-views other than `PartyQueue` are separate translation tasks not yet completed. The page shell must render a placeholder or null in those slots for the first port, and wire the real sub-view component in once it is ported. The slot itself (the main content region and the routing logic to select what occupies it) is fully specced here.

### Sub-view list (by route segment)

- Queue sub-view: `PartyQueue` from `@/widgets/party-queue`. This is the default view (the base party route). Internally responsible for displaying the sorted list of tracks. See `docs/specs/views-party-queue.spec.md` for the full contract.
- Search sub-view: a `PartyTrackSearch` component - SEPARATE translation task (`views/party-search.ts`), not yet ported. The shell reserves this slot.
- Settings sub-view: a `PartySettings` component - SEPARATE translation task (`views/party-settings.ts`), not yet ported. The shell reserves this slot.
- Share sub-view: a `PartyShare` component - SEPARATE translation task (`views/party-share.ts`), not yet ported. The shell reserves this slot.
- TV sub-view: a `ViewTV` component - SEPARATE translation task (`views/view-tv.ts`), not yet ported. The shell reserves this slot.

In the first port of the shell, the sub-view slot renders `PartyQueue` for the queue route and null (or a placeholder Spinner) for all other sub-routes, so the page is navigable without crashing.

### Sign-in modal

The sign-in modal is an overlay dialog owned by the page shell. It opens when the auth layer sets the sign-in-required flag (for example, after a guest attempts to vote and the party configuration requires authentication). The modal content adapts to two modes:

The following heading and body-text strings are **CrowdTune-original copy proposed by the translator** (not Festify verbatim); the implementer should use them as-is unless product requests changes:

**Normal sign-in mode**: heading "Please sign in to vote"; body text explains that the party host requires guests to sign in. The modal renders one button per provider currently enabled in our Neon Auth configuration (read at runtime; do NOT hardcode a provider enumeration). Spotify is NOT included even when the auth client lists it, because Spotify is not a Neon Auth social provider in our deployment (separate Phase 9 wiring). Any provider in the enabled set is fully interactive; providers not in the enabled set are not rendered at all in this mode.

**Follow-up sign-in mode**: heading "Further action required"; body text asks the user to sign in with one of their previously linked social accounts. Triggered when the auth system detects that the email address associated with the chosen provider is already linked to an existing account via a different provider. In this mode, only the providers already linked to the existing account are rendered as enabled buttons; other providers from the configured set are shown with `isDisabled` set so the user can see the constraint visually.

The modal has a "Cancel" button that closes it without signing in. Tapping any identity provider button initiates the OAuth flow for that provider.

The modal closes when:
- The user successfully completes OAuth sign-in.
- The user taps the Cancel button.
- The user dismisses the modal via the backdrop or keyboard escape.

When the modal closes, the page-local `isSignInModalOpen` boolean is set to false.

### Track drag-and-drop in the queue sub-view

The `PartyQueue` widget supports drag-and-drop reordering when visible. The page shell listens for drag enter, drag over, and drop events on the queue region and forwards these to the feature layer's drag-and-drop handlers. In the first port of CrowdTune this feature may be deferred; see section 6, open question 3.

### Queue list reorder animation

When the sub-view is the queue and a vote causes the sorted order to change, the transition between render states should be animated. The page shell is not directly responsible for this animation - it is handled by the `PartyQueue` widget internals. However, the page shell must not perform any DOM operation between renders that would interfere with the animation (for example, re-mounting the sub-view from scratch on each re-render). The sub-view slot must be stable in the React tree when the same route is active. See `docs/specs/views-party-queue.spec.md` section 3 for the animation specification.

### Unmount and cleanup

When the user navigates away from the party route (for example, by pressing the browser back button or navigating to the home page), the page component unmounts. On unmount it must:

1. Cancel the party data subscription (TanStack Query's cleanup handles this if the query is scoped to the component or a context that unmounts with it).
2. Cancel the playback data subscription in the same way.
3. If a Spotify Web Playback SDK device was registered during this session (a future port concern), deregister it.
4. Remove any global keyboard listeners registered by the page.

---

## 4. Side Effects

### Data subscriptions

On mount the page initiates a read subscription to party data keyed by the party identifier. This may be a TanStack Query polling query (with a short refetch interval, e.g. 5 seconds, to stay near-real-time) or a WebSocket connection if the backend exposes one. The implementer must choose the mechanism; see section 6, open question 1.

Similarly, a read subscription to playback data (current track progress, play/pause state, and device assignment) is initiated on mount. These are passed as props to the `PartyQueue` widget and to the QueueDrawer for display purposes.

### OAuth initiation

Tapping an identity provider button in the sign-in modal calls the Neon Auth sign-in function for that provider. This is an external redirect (the browser navigates to the OAuth provider's authorization page). The page does not receive a synchronous callback; the OAuth flow completes asynchronously with a redirect back to the app. The app's auth layer handles the redirect result and updates the session.

### Analytics

The source does not include an explicit analytics call on mount, but the implementer should confirm whether a page-view event should be fired when the party page is visited. This is an open product question (see section 6, question 5).

### Keyboard shortcuts

The page shell registers a keyboard listener on mount for at least the Escape key. Pressing Escape while the sign-in modal is open closes the modal. Pressing Escape while the drawer is open (on narrow viewports) closes the drawer. The listener is removed on unmount.

### No audio output

The page shell has no direct Spotify SDK or Web Audio API calls. All audio side effects are handled by the feature layer's mutation hooks and, in a later port, the Spotify Web Playback SDK integration module.

---

## 5. Edge Cases Worth Preserving

- **Party not found or invalid party identifier**: if the party data fetch returns a 404 or equivalent error, the page should display an error state (party not found) rather than crashing. The header still renders but the party name falls back to a placeholder. The sub-view slot renders the error state rather than the queue widget. This is a first-class edge case because users may follow stale links to parties that no longer exist.

- **Loading state on initial mount**: before the first party data response arrives, the party name in the header is unknown. The page should show a loading placeholder (a skeleton or empty string) in the party name slot. The main content area shows a centered loading indicator (HeroUI Spinner). The QueueDrawer can still render with whatever data it has (it may show the user name from the session even before party data arrives).

- **Unauthenticated guest**: a user who has not signed in at all can still visit a party page. If the party does not require sign-in to vote, they can browse and vote anonymously. If sign-in is required, the sign-in modal appears on the first action that requires authentication (not proactively on page load). The page must not redirect unauthenticated users away unless the party itself is marked as requiring authentication for entry - which is a product decision not yet specified. Default: unauthenticated users land on the page and see the queue.

- **Host vs. guest distinction**: the page derives whether the current user is the host by comparing the authenticated user's identifier against the party's `created_by` field. If the user is unauthenticated (no session), they are always treated as a guest. The is-owner flag is passed into the sub-views and the QueueDrawer so they can show host-only affordances.

- **Follow-up sign-in modal**: this edge case occurs when a user tries to sign in with a social provider, but the auth system detects that their email is already associated with a different provider. In this case the modal stays open with follow-up mode content (different heading and only the previously used providers enabled). The user must complete the follow-up step or cancel. The page must correctly distinguish this mode from normal sign-in mode based on the auth layer's state.

- **Narrow vs. wide viewport**: on narrow viewports the drawer is hidden by default and the hamburger icon is visible in the header. On wide viewports the drawer is permanently visible and the hamburger icon is hidden. The fixed header adjusts its left offset on wide viewports so it does not overlap the drawer. The page shell must apply these responsive layout rules correctly; they are structural, not cosmetic.

- **Returning to the queue sub-view from another sub-view**: when the user navigates from the settings or search route back to the base party route, the `PartyQueue` widget remounts (or, if the implementer chooses to keep it mounted in the background, it becomes visible again). If kept mounted, scroll position should be preserved (see section 6, question 2 for the policy decision). If remounted, scroll resets to top.

- **Empty party name**: if the party record has no name set (possible during creation), the header title region shows an empty string or a placeholder. It must not crash.

- **OAuth provider button disabled state**: in the sign-in modal, buttons for providers that are not enabled must be visually and functionally disabled (not just styled differently). The HeroUI Button's disabled prop should be set, not just a CSS class.

- **Backdrop click dismissing the modal**: clicking outside the sign-in modal should close it (same as Cancel). The `isSignInModalOpen` flag is set to false and no sign-in action is taken.

---

## 6. Open Questions for the Implementer

1. **Data subscription mechanism**: the party data and playback data should update in near real-time for the party experience to feel live. The source used Firebase RTDB's live listener. In our stack the options are: TanStack Query with a short polling interval (simple, works immediately, slightly delayed), a WebSocket endpoint (lower latency, more backend work), or Server-Sent Events. The implementer and product team should decide before building the data layer. The page shell spec is agnostic to the mechanism; it only specifies that the data arrives reactively. Flag for architecture review.

2. **Scroll restoration when returning to the queue sub-view**: if the user navigates from the queue to settings and back, should the queue list restore its last scroll position? TanStack Router supports scroll restoration at the route level. The product team should confirm the expected behavior. Default suggestion: restore scroll position on back navigation, reset to top on forward navigation to the queue route.

3. **Drag-and-drop reordering**: the source wires drag-enter, drag-over, and drop events on the queue sub-view region and forwards them to the feature layer. These events enable reordering tracks by dragging. This is a complex interaction pattern and may not be required in the first port. The product team should confirm whether drag-and-drop reordering of tracks is in scope for this port or deferred. If deferred, the shell simply does not wire these event handlers.

4. **Sign-in modal trigger timing**: the source opens the modal when the auth state signals that sign-in is required. It is not entirely clear whether this check happens on page load (proactively, if the party requires sign-in and no session exists) or reactively (only after the user tries to take an action like voting). Product should decide: proactive modal on page load for parties requiring authentication, or reactive modal triggered by a specific user action.

5. **Analytics page-view event**: should the page fire a tracking event when a user visits a party? If so, what payload does it carry (party identifier, user type host/guest, anonymous flag)? This is a product and analytics decision. For the first port: if analytics are not in scope, omit the tracking call entirely (no placeholder, no comment); record the deferred concern in `docs/translation-progress.md` and revisit when analytics are added.

6. **Sign-in modal HeroUI component**: the source uses a paper-dialog (a Material Design modal). In our stack HeroUI v3 ships a Modal component. The implementer must call `get_component_docs` on the heroui-react MCP for the Modal component before implementing, to confirm the correct API (specifically: the controlled open/close pattern, the backdrop-click behavior, and the correct compound subcomponents such as Modal.Header, Modal.Body, Modal.Footer). Do NOT hand-roll a modal overlay.

7. **Playback progress bar sub-component**: the source includes a playback progress bar element in the fixed header. This is a separate Festify component not yet translated. For the first port, the header region must reserve the layout space for it (a fixed-height strip at the bottom of the header) but render nothing yet. Implement this as a named `PlaybackProgressBarSlot` placeholder component (in the same file as `PartyPage`, or as a sibling under `apps/web/src/pages/party/ui/`) whose JSX is a single empty container with the reserved height. Its docblock states that the slot is intentionally empty until the playback-progress-bar spec and implementation land. Do NOT leave a `// TODO` comment; use the named placeholder + docblock pattern.

8. **Toast container**: the source does not include an explicit toast notification container, but the party page is a natural mount point for toasts (vote confirmed, error toasts, etc.). The implementer should check whether HeroUI v3 ships a Toast or Notification provider component (via `list_components` on heroui-react MCP) that should be mounted once at this page level. If so, the page shell should include it. If not, the global app shell at `apps/web/src/app/` may be a better mount point.

9. **Spotify Web Playback SDK**: the source does not include SDK initialization code in this file - it is handled elsewhere in Festify. For CrowdTune, the SDK registration is intentionally out of scope for this first page port (see section 7, lock-now decisions). The implementer should leave the SDK integration entirely unimplemented (no placeholder, no comment); record the deferred concern in `docs/translation-progress.md` and add it in a future port when the SDK module is ready.

---

## 7. Stack Mapping Notes

### Lock-now decisions for this port

- **Component shape**: implement as a React function component. The name is `PartyPage`. It reads the party identifier from TanStack Router's `useParams` hook internally rather than accepting it as a prop. It manages two page-local boolean states: `isDrawerOpen` (for the QueueDrawer) and `isSignInModalOpen` (for the sign-in modal). No class components.

- **FSD placement**: `apps/web/src/pages/party/ui/PartyPage.tsx` with a public barrel at `apps/web/src/pages/party/index.ts`. The TanStack Router file-based route at `src/routes/party.$partyId.tsx` is a thin wrapper that imports `PartyPage` and binds it to the route (per the project rule that route files contain no business logic). This follows the FSD convention: the pages layer contains route-level components; the routes directory is the TanStack Router exception that defers to the pages layer.

- **QueueDrawer is controlled**: the page owns `isDrawerOpen` (boolean, initialized to false) and passes a toggle callback to the hamburger button in the header. The QueueDrawer widget receives `isOpen={isDrawerOpen}` and `onClose={() => setIsDrawerOpen(false)}`. Cross-reference the `QueueDrawer` contract at `docs/specs/views-queue-drawer.spec.md`. The page does NOT use an uncontrolled drawer or manage drawer state inside the QueueDrawer itself.

- **`currentSubView` is derived from the active route**: use TanStack Router's `useMatchRoute` or the router's match state to determine which sub-view route is currently active and map it to the sub-view enum value (`'queue' | 'search' | 'settings' | 'share' | 'tv'`). The queue sub-view is the default when no sub-route segment is active. This value is passed as the `currentSubView` prop of `QueueDrawer`.

- **QueueDrawer's `username` prop**: obtain from the Neon Auth session via the existing `@/shared/auth/auth-client.ts` hook (the `useSession` function or equivalent exported from that module). Pass the user's display name or email as the username prop. If unauthenticated, pass null or an empty string and let the QueueDrawer handle the guest display (per its own spec).

- **QueueDrawer navigation paths**: the `queuePath`, `settingsPath`, `sharePath`, and `tvPath` props passed to `QueueDrawer` are constructed using TanStack Router's path-building utility (the `getRouteApi` or link-builder for the relevant routes). Do NOT hardcode strings like `"/party/abc/settings"`. Use the router's type-safe path building so that route renames propagate automatically.

- **Party data query**: the page calls a TanStack Query `useQuery` hook with the party identifier as the query key. The query function calls the party endpoint via `@/shared/api/client.ts`'s `api()` wrapper (per the project rule: no raw `fetch` in components). The party data is typed using the `Party` entity type from `@/entities/party`.

- **Playback data query**: similarly, a `useQuery` hook for playback data keyed by the party identifier. The playback data is typed using the `Playback` entity type from `@/entities/party`.

- **Sub-view rendering via route matching**: the main content region uses TanStack Router's `Outlet` component (or equivalent) to render the currently matched child route's component. The route tree should define the sub-view routes as child routes of the party route so that the party shell's layout wraps them automatically. The `PartyQueue` widget is the index (default) child route's component. The other sub-view routes render their respective components once ported.

- **Sign-in modal**: use HeroUI v3's Modal component (confirm API via the heroui-react MCP before implementing). The modal is controlled via `isOpen={isSignInModalOpen}` and `onClose={() => setIsSignInModalOpen(false)}`. The two content modes (normal vs. follow-up) are rendered conditionally inside the modal body based on the auth layer's state. Identity provider buttons use HeroUI's Button component with the disabled prop set when the provider is not enabled.

- **Page-level callbacks passed to sub-views**: the vote, remove, toggle-playback, and transfer-playback mutation callbacks are NOT defined inside `PartyPage`. They are defined in the feature layer (separate translation tasks for each feature slice). The `PartyPage` imports them from the feature layer and passes them as props to `PartyQueue`. The page shell is a wiring point, not a mutation author.

- **Drag-and-drop**: defer for the first port. Do not wire drag-enter/over/drop handlers in the first implementation. Do NOT leave a `// TODO` comment; simply omit the wiring. Record the deferred concern in `docs/translation-progress.md` so the next port pass can pick it up.

- **Spotify Web Playback SDK**: defer entirely. Do NOT include a `// TODO` comment or a placeholder `useEffect` in this first port. The SDK integration is a separate future port; the deferred concern is recorded in `docs/translation-progress.md`.

- **Keyboard shortcut listener**: register a `keydown` listener on the document (or window) in a `useEffect` with cleanup. Escape key closes the sign-in modal if open, or closes the drawer if the modal is not open. Remove the listener in the effect's cleanup function. This must be paired with a `useEffect` dependency array that includes both boolean states so the handler always references current values (or use a ref-based pattern to avoid stale closures).

- **Responsive layout**: the left offset of the header and main content region on wide viewports is driven by a CSS media query, not by JavaScript. The QueueDrawer widget handles its own open/closed presentation. The page shell sets a CSS class or data attribute on the layout container to indicate wide-viewport mode; the actual 256-pixel offset is expressed in CSS. Do NOT compute layout offsets in JavaScript.

- **Header height offset for main content**: the main content region must start below the fixed header. The source uses a fixed top padding value of 120 logical pixels on the content area to account for the header's total height (toolbar row + search bar + progress bar). In our stack this value should be a CSS custom property or a Tailwind spacing token, not a hardcoded pixel value. If the header height changes (for example, when the playback progress bar is ported and added), only the CSS property needs updating.

- **No Redux, no Redux-saga, no Polymer, no shadow DOM**: the CrowdTune implementation uses React function components, Zustand for global UI state (if needed beyond the two local booleans), TanStack Query for server state, and TanStack Router for routing. None of the Festify framework's connection mechanisms are carried forward.

### Technology mapping summary

| Festify concept | CrowdTune equivalent |
|---|---|
| Polymer custom element registered as `view-party` | React function component `PartyPage` |
| Redux `connect` wrapper reading store slices | `useQuery` hooks + Neon Auth session hook inside the component |
| Redux action dispatch for modal open/close | `useState` boolean setter (`setIsSignInModalOpen`) |
| `iron-pages` sub-view selection by attribute | TanStack Router `Outlet` with child routes per sub-view |
| `app-drawer-layout` with `app-drawer` slot | QueueDrawer widget (controlled via `isOpen` and `onClose`) |
| Fixed `header` with `app-toolbar` | Standard `header` element with HeroUI layout primitives inside |
| `paper-dialog` sign-in modal | HeroUI Modal component (confirm API via heroui-react MCP) |
| `paper-icon-button` hamburger toggle | HeroUI IconButton or Button with icon variant |
| `paper-button` OAuth provider buttons | HeroUI Button with `isDisabled` prop |
| `dom-flip` reorder animation | Browser View Transitions API or deferred (per party-queue spec) |
| Firebase RTDB subscription | TanStack Query polling or WebSocket (implementer decision - see section 6, question 1) |
| Redux router `result.subView` field | TanStack Router `useMatchRoute` result mapped to sub-view enum |

### Dependency summary

- `QueueDrawer` from `@/widgets/queue-drawer` (already shipped).
- `PartyQueue` from `@/widgets/party-queue` (already shipped).
- `Party` and `Playback` entity types from `@/entities/party` (assume shipped or co-ported).
- `Track` and `Metadata` entity types from `@/entities/track` (already shipped).
- TanStack Router: `useParams`, `useMatchRoute` or equivalent, `Outlet`, link-builder utility.
- Neon Auth session hook from `@/shared/auth/auth-client.ts` (already shipped).
- API client `api()` from `@/shared/api/client.ts` (already shipped).
- TanStack Query `useQuery` for party data and playback data.
- HeroUI Modal for the sign-in modal (confirm API via heroui-react MCP before implementing).
- HeroUI Button for OAuth provider buttons (confirm disabled prop API).
- HeroUI Spinner for the loading state in the main content area.
- Feature layer vote/remove/playback mutation hooks - SEPARATE translation tasks, not yet ported. The page receives these as imported functions and passes them as props to `PartyQueue`.
- Sub-view components (`PartyTrackSearch`, `PartySettings`, `PartyShare`, `ViewTV`) - SEPARATE translation tasks, not yet ported. The page shell renders them in the sub-view slot once available.
- `playback-progress-bar` equivalent - SEPARATE translation task, not yet ported. The header reserves layout space for it.
