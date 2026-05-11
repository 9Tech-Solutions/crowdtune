# Spec: Queue Drawer Navigation Panel

Translation source: Festify `views/queue-drawer.ts`
Translation date: 2026-05-11
Status: Second UI port. Depends on the already-shipped `PartyTrackRow` component (from `views-party-track.spec.md`) only tangentially - PartyTrackRow lives in the body of the *party queue view*, which is a sibling route, not inside this drawer. This component is purely a navigation panel.

---

## Important clarification for the orchestrator

The name "queue-drawer" is Festify's internal label for what is functionally a **navigation sidebar** that slides in alongside the party queue view. It does NOT render a list of queued tracks. The track list lives in a separate sibling view (not translated in this file). The prompt's instructions anticipate this panel might be a track-list drawer; this spec corrects that assumption and describes what the source actually does: a branded side panel with a user identity section and a navigation menu linking to all sub-views of a party session. Any implementer reading this spec should understand they are building a navigation sidebar, not a queue list.

---

## 1. Purpose

This component is the persistent navigation panel for a live party session. It gives every party participant (guest or host) access to the main sub-views of the session - the track queue, the party share page, and the TV display mode - as well as the ability to exit the party entirely. It also shows the logged-in user's display name and provides a secondary account menu with logout and legal links. For the party host it additionally surfaces a Settings link and, for guests who are not yet authenticated, an invitation to authenticate as the party admin. The drawer acts as the global wayfinding layer while the party is active, appearing as a slide-in overlay that does not replace the underlying view content.

---

## 2. Public Contract

### 2a. Inputs (props)

This component is controlled externally for visibility; the drawer itself does not manage its own open/closed state. The parent view (the party page shell) owns the boolean that decides whether the drawer is visible or hidden, and passes a callback to close it.

| Prop | Type | Required | Notes |
|---|---|---|---|
| Is-owner flag | Boolean | Yes | True when the authenticated user is the host of the current party. Governs which navigation items appear. |
| Current sub-view identifier | Enumerated value (one of: Queue, Search, Settings, Share, TV) | Yes | Used to mark the currently active navigation item with a highlighted/active state. |
| Queue route path | String (URL path) | Yes | The in-app path for the party queue and search sub-view. |
| Settings route path | String (URL path) | Yes | The in-app path for the party settings sub-view. Only rendered for the host. |
| Share route path | String (URL path) | Yes | The in-app path for the party share sub-view. |
| TV route path | String (URL path) | Yes | The in-app path for the TV display mode. |
| User menu open flag | Boolean | Yes | Controls whether the secondary user account menu (logout / legal / privacy) is shown in place of the main navigation menu. Toggled by tapping the user identity row. |
| Username | String or null | Yes | The display name of the authenticated user. Null when the user is not authenticated or the name has not yet loaded. When null, the user identity row is hidden entirely. |

### 2b. Callbacks / events emitted

| Callback | When triggered | Payload |
|---|---|---|
| Navigate to route | User taps any navigation link (queue, settings, share, TV, exit) | The target URL path; the caller handles the actual routing transition. |
| Enter admin mode | Unauthenticated guest taps "Login for Admin Mode" | None. Caller initiates the Spotify OAuth flow. |
| Logout | Authenticated user taps logout inside the user menu | None. Caller clears the session. |
| Toggle user menu | User taps the user identity row in the header | None. Caller flips the user-menu-open flag. |
| Close drawer | User taps outside the drawer or presses Escape | None. Caller sets the drawer's visibility to false. |

### 2c. State observed (read from shared application state)

All of the props listed in section 2a are derived from shared application state by the parent or a connecting wrapper:

- **Party host identity**: the identity of the party owner compared against the current user's identity. Derived from the already-specced `isPartyOwnerSelector` logic (see `selectors-party.spec.md`).
- **Current router sub-view**: the active route's sub-view token, read from the router state slice.
- **All four route paths**: computed strings from the route selector functions (see `selectors-routes` - a separate translation task not yet completed). Each route selector reads the current party identifier from router state and constructs the correct in-app path.
- **User menu open flag**: a single boolean stored in the party-view UI state slice (not in the router or party data). This is local UI state, not persisted.
- **Current username**: the display name of the authenticated user. Derived from a users selector (see `selectors-users` - a separate translation task not yet completed). May be null.

### 2d. State mutated

- **User menu open flag**: the toggle-user-menu callback flips this boolean in the party-view UI state slice.
- **Authentication session**: the logout callback clears the session (handled by the auth module, which is a separate translation task).
- **Router state**: the navigate callback updates the active route (handled by the router, which is TanStack Router in our stack).

---

## 3. Behavior

### Opening and closing

The drawer is controlled by the parent party page shell. The shell passes an open/closed boolean and a close callback. The drawer itself is always rendered in the DOM when the party page is mounted; its visibility is toggled via the controlling boolean, not by conditional rendering. On the desktop layout the drawer slides in from the left edge; on a mobile layout it may occupy a bottom sheet or a full-width overlay depending on the responsive breakpoint (see section 7 for the lock-now decision on responsive shape).

The drawer closes when the user taps the backdrop area outside the drawer panel, or when the user presses the Escape key. Navigation link taps also close the drawer after navigating (the parent handles both the routing and the close callback in sequence).

### Structural regions

The drawer has three semantic regions stacked vertically:

**Header region** - a fixed-height branded area that spans the full width of the drawer. It contains:
1. The application logo (CrowdTune brand mark, not the Festify logo), displayed at the top-left of the header.
2. A user identity row at the bottom of the header, visible only when the username prop is non-null. The user identity row displays the username as plain text and an expand/collapse chevron icon button on the right. The chevron rotates 180 degrees when the user menu is open (a CSS transition on the icon). Tapping anywhere on the user identity row fires the toggle-user-menu callback.

When the username is null the user identity row is visually hidden (zero opacity, pointer events disabled, no layout shift because it remains in the DOM). The header still shows the brand logo in that state.

**Main navigation menu** - a vertical list of text links with leading icons, displayed immediately below the header. This region is visible when the user menu is NOT open. It slides or fades out (with a short transition) when the user opens the user menu. The links in this menu are, in order:

1. Queue (with a list/menu icon) - links to the queue route. Marked active when the current sub-view is Queue or Search (both sub-views share the queue route as the parent path).
2. Settings (with a settings gear icon) - links to the settings route. Only rendered when the is-owner flag is true. Marked active when the current sub-view is Settings.
3. "Login for Admin Mode" (with a remote control icon) - only rendered when the is-owner flag is FALSE. This is an action link, not a navigation link; it fires the enter-admin-mode callback rather than navigating. It has no active state.
4. Share (with a share icon) - links to the share route. Marked active when the current sub-view is Share.
5. TV Mode (with a TV/monitor icon) - links to the TV route. No active state in the source (the TV route is an external-style link that opens the TV display; it does not set a sub-view that the drawer would recognize as "active").
6. Exit Party (with a cancel/close icon) - links to the application root (the home page, outside any party). This always navigates away from the party entirely.

Each link in the main menu triggers the navigate callback with its target path and then closes the drawer. The "Login for Admin Mode" and "Exit Party" items are special: the admin link calls enter-admin-mode instead of navigating, and the exit link navigates to the app root (outside the party route tree).

**User account menu** - a secondary vertical list of links, displayed in the same region as the main navigation menu but visible only when the user menu IS open. When the main menu hides, this menu appears (same CSS transition, mirrored). The links in this menu are:

1. Logout (with an exit/door icon) - fires the logout callback. Not a route navigation.
2. Legal (with a gavel/law icon) - an external link to the product's terms/disclaimer page. Opens in a new tab.
3. Privacy (with a shield/verified icon) - an external link to the product's privacy policy page. Opens in a new tab.

The Legal and Privacy links use CrowdTune's own legal page URLs (not Festify's). The exact URLs are a lock-now decision in section 7.

### Active-state derivation

A navigation link receives its active visual treatment when the current sub-view matches the link's associated view. The mapping is:

- Queue link: active when sub-view is Queue OR Search.
- Settings link: active when sub-view is Settings.
- Share link: active when sub-view is Share.
- TV Mode link and Exit Party link: never rendered as active.

The active link is visually distinguished from inactive links by color (the primary brand color, applied to both the icon and the text).

### Menu transition behavior

The main navigation menu and the user account menu share the same vertical space below the header. They do not stack; only one is visible at a time. The transition between them is animated: the visible menu scales slightly on its vertical axis and fades to zero opacity as it hides; the incoming menu animates in from a slightly scaled state to normal scale while fading in. The transform origin is the top center of the menu region. The transition duration is approximately 300ms with an ease curve. This animation is a progressive enhancement; if reduced-motion is preferred, the transition should be skipped (see section 7).

---

## 4. Side Effects

### Routing

When any navigation link is tapped, the party-session router (TanStack Router in our stack) receives a navigation intent for the target path. The drawer does not write to router state directly; it fires the navigate callback and the parent handles the router call. This keeps the drawer free of router dependencies.

### Authentication

The enter-admin-mode callback triggers a Spotify OAuth login flow. In the source this is a direct dispatch to the auth module; in our stack it becomes a call to the auth feature's login function (a separate translation task). The drawer component itself has no knowledge of the OAuth flow mechanics.

The logout callback clears the session via the auth module. After logout the username will become null (the shared user state is updated by the auth module), causing the user identity row to hide.

### No network calls from the drawer directly

The drawer component itself does not initiate any network requests. All data it displays (username, party ownership, route paths) is pre-derived by the parent or by selectors and arrives as props.

---

## 5. Edge Cases Worth Preserving

- **Null username (unauthenticated or loading)**: the user identity row is hidden with zero opacity and disabled pointer events. The main navigation menu is still visible. The user account menu (logout / legal / privacy) is inaccessible because the toggle that opens it is on the now-hidden identity row.
- **Guest user (is-owner false)**: the Settings link is not rendered. Instead the "Login for Admin Mode" link appears in its place. This means guests always see five items in the main menu (Queue, Login for Admin, Share, TV Mode, Exit Party) while hosts see five different items (Queue, Settings, Share, TV Mode, Exit Party).
- **User menu open, then username becomes null**: if the username prop transitions from non-null to null while the user menu is open (e.g., logout completes and the session clears), the user identity row disappears and the toggle mechanism is gone. The parent must reset the user-menu-open flag to false when the username becomes null, or the user account menu will remain visible with no way to dismiss it. This is a subtle state-cleanup edge case.
- **Current sub-view is TV**: no main menu link is marked active. This is intentional - the TV mode is treated as a separate display, not a persistent "selected" state within the drawer.
- **Current sub-view is undefined or unknown**: no link is marked active. The drawer renders safely.
- **Drawer open during route transition**: the drawer may still be open while the route is transitioning. The active-link highlighting updates immediately as the sub-view prop updates; the drawer does not need to close before the active state reflects the new sub-view.
- **External links (Legal, Privacy)**: these open in a new browser tab and do not close the drawer. The drawer remains open. This is intentional UX in the source.

---

## 6. Open Questions for the Implementer

1. **Container primitive selection**: the implementer must call `list_components` and `get_component_docs` on the heroui-react MCP to determine whether HeroUI v3 ships a Drawer primitive, and if so whether it supports the required slide-in behavior, backdrop tap-to-dismiss, and Escape key dismiss out of the box. If HeroUI's Drawer covers these needs, use it. If not, the next candidate is HeroUI's Modal (which provides overlay + focus trap + Escape dismiss) styled to the sidebar shape. This is a stack-discovery question the MCP answers definitively.

2. **Responsive shape - desktop side panel vs mobile bottom sheet**: the source renders a full-height left-edge sidebar. Does CrowdTune want the same full-height left sidebar on all breakpoints, or a responsive shape that becomes a bottom sheet on mobile? This is a product/UX decision; the implementer's MCP query in question 1 will already surface what HeroUI supports.

3. **Legal and Privacy page URLs**: the source links to external Festify pages. CrowdTune needs its own legal and privacy URLs. These should be provided by product/legal before the component ships. Until they exist, the links can point to placeholder routes or be omitted from the first iteration. Lock-now: do not copy Festify's URLs.

4. **"Login for Admin Mode" flow integration**: this item triggers the Spotify OAuth login. In our stack the auth flow is managed by the Neon Auth / Better Auth integration (see `spotify-auth.spec.md`). The implementer must confirm with the auth feature owner what callback or hook to call from the drawer's enter-admin-mode handler - it is not simply `window.location.href`.

---

## 7. Stack Mapping Notes

### Lock-now decisions for this port

- **Component shape**: implement as a React function component. The component is controlled (open/closed boolean + onClose callback from the parent). It does not hold its own open/closed state.

- **No Festify logo**: replace the Festify SVG logo in the header with the CrowdTune brand mark. The brand mark source file and usage pattern are outside this translation scope; the implementer should request it from the design owner. Do not use a placeholder text string in the shipped component.

- **No Festify or external Festify URLs**: the Legal and Privacy links must use CrowdTune's own URLs. If those URLs are not yet known, render the links as disabled anchors or omit them from the initial port and add them in a follow-up. Do not use Festify's domain.

- **Reduced-motion respect**: wrap the menu-swap transition in a check for the user's reduced-motion preference (the standard CSS media query equivalent in the animation system). When reduced motion is preferred, skip the scale/opacity transition and show the swap instantly. This is a locked accessibility requirement, not an open question.

- **Escape key dismiss**: the drawer must close when the user presses Escape. If using HeroUI's Drawer or Modal primitive, this is likely built in. If composing a custom overlay, wire the Escape key via the appropriate keyboard event handling in the container. Do not omit Escape key support.

- **Backdrop tap-to-close**: tapping outside the drawer panel (on the backdrop) fires the onClose callback. Again, likely provided by HeroUI's Drawer primitive; confirm via MCP query before wiring manually.

- **Navigation link behavior**: navigation links are anchor elements (or TanStack Router Link components) that navigate to the target route and then call onClose. Do not use Button components styled as links for the navigation items; preserve the semantic anchor element so browser navigation affordances (right-click open in new tab, keyboard tab focus) work correctly. The TV Mode and Exit Party items may also be anchors pointing to their respective paths.

- **Active link styling**: use HeroUI's intrinsic color token for the primary brand color rather than a hardcoded hex value. The active state applies to both the icon and the text label of the link. Inactive links use a muted/secondary color.

- **User identity row animation**: the chevron icon rotates 180 degrees when the user menu is open. Implement via a CSS class toggle or a Tailwind `rotate-180` utility applied conditionally. Use a CSS transition of approximately 300ms ease. Respect reduced-motion (skip the transition when preferred).

- **FSD placement**: this component belongs in the `widgets` layer at `apps/web/src/widgets/queue-drawer/ui/QueueDrawer.tsx`. Rationale: it composes multiple domain entities (user identity, party ownership, routing) and orchestrates navigation across the entire party session. It is not a pure entity (it does more than display one domain object) and it is not a feature (it does not own a specific mutation flow). It is a page-level structural widget that the party page shell imports. The FSD import rule is satisfied: widgets may import from entities and features; the party page (pages layer) imports from widgets.

- **Route path props vs direct router reads**: the drawer receives the four route paths as props rather than reading the router directly. In our stack the parent party page derives these paths using TanStack Router's `useNavigate` and route definitions, then passes them as strings. The drawer does not import TanStack Router hooks directly. This keeps the drawer testable in isolation with mock paths.

- **User menu state location**: the user-menu-open boolean is local UI state, not shared Zustand state. The parent party page shell may manage it as a `useState` value and pass it down with the toggle callback, or it may live in a narrow UI Zustand slice if other parts of the page need to react to it. The drawer component itself does not own this state; it receives a boolean and a callback.

- **No row separators**: navigation links in both menus are separated by vertical spacing (margin-bottom on each item) rather than explicit divider elements. Use HeroUI's intrinsic spacing (gap on a flex column container, or the navigation link's own margin token) rather than rendering a Separator component between every link.

### FSD and dependency summary

- This component lives at `apps/web/src/widgets/queue-drawer/ui/QueueDrawer.tsx` with a public barrel at `apps/web/src/widgets/queue-drawer/index.ts`.
- The party page shell at `apps/web/src/pages/party/` imports it.
- It does NOT import `PartyTrackRow`. The track list is a separate sibling view.
- It depends on the `isPartyOwnerSelector` logic (from `selectors-party.spec.md`, already translated - separate implementation task).
- It depends on the route path selectors for the four party sub-view routes (from a `selectors-routes` module - a separate translation task not yet completed; this is a blocker for the drawer's full implementation).
- It depends on the current-username selector (from a `selectors-users` module - a separate translation task not yet completed).
- It depends on the auth module's login and logout functions (from `spotify-auth.spec.md`, already translated).
- It depends on TanStack Router's navigation primitives for the link elements and the navigate callback.
- The user-menu-open toggle action maps to a simple state setter (useState or a narrow Zustand action), not to a complex saga or thunk. This is a trivially local UI state transition.
- The enter-admin-mode action maps to the Spotify OAuth trigger in the auth feature (see `spotify-auth.spec.md`). The drawer passes this as a callback prop; it does not import the auth feature hook directly.

### Polymer / web-component concepts not carried forward

The source registers a custom HTML element and uses a framework-specific state-connection pattern. None of that applies in our stack. The CrowdTune implementation is a plain React function component that receives props and fires callbacks, with no custom element registration, no shadow DOM, and no framework-specific connect function.
