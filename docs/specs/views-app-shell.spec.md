# Spec: views/app-shell.ts

**Source provenance:** Festify `src/views/app-shell.ts` (LGPLv3). Translated to prose on 2026-05-12. No source code reproduced.

---

## 1. Purpose and scope

The Festify app-shell is the single root component that the browser mounts on startup. It has exactly four responsibilities and nothing else:

1. Route resolution - read the current route value from the global Redux store and select one of three views to render (Home, Party, or TV).
2. View composition - render whichever of those three view components the active route demands, swapping them out as navigation events update the store.
3. Global toast - render a single application-wide notification banner, controlled entirely by a store slice that holds the current toast text and an open/closed flag.
4. Spotify Web Playback SDK injection - conditionally inject the Spotify player JavaScript from Spotify's CDN, but only when the current user is the designated playback master for the active party.

The shell renders no persistent header, footer, navigation drawer, or other application chrome. Its visual output is a full-viewport-height flex column that contains whichever view is active, the icon sprite set, the toast element, and the conditional Spotify script tag.

---

## 2. Public API / props contract

The Festify component is a Polymer custom element with no public HTML attributes or JavaScript properties exposed to its parent. It is self-bootstrapping: it connects to the Redux store directly at definition time and derives all of its needed values from store state. From the parent's perspective this is a zero-prop component.

The four values it derives from the store are:

- **Active view** (enumerated string, required, defaults to Home) - which of the three named views is currently active, determined by the router result stored in Redux.
- **Playback master flag** (boolean, required) - whether the current user's session is the designated audio-output controller for the party; drives the Spotify SDK injection.
- **Toast open flag** (boolean, derived) - true when the toast slice in the store holds a non-empty string; false otherwise.
- **Toast text** (string, required) - the human-readable message to display in the toast; empty string when no toast is active.

---

## 3. Render states

The shell itself has no asynchronous loading state of its own. It is a static composition: the moment the store emits a state update the render function runs synchronously. There are therefore only two meaningful render branches:

- **Home view active** - renders the home view component in place of the route slot.
- **Party view active** - renders the party view component in place of the route slot.
- **TV view active** - renders the TV view component in place of the route slot. (The TV route is a read-only ambient display mode, distinct from the interactive party view.)

The default branch when the router result is absent or unrecognised falls back to the Home view.

There is no skeleton loader, no error boundary, and no spinner within the shell itself. All of those concerns, if they exist, live inside the individual view components.

---

## 4. Behavior

### 4.1 Route resolution

On every store state change the shell reads the current router result from the Redux router slice. If the result is absent (typically on first boot before the router middleware has emitted its first event) the shell defaults to the Home view. Otherwise it reads the named view enum value from the result and delegates rendering to the matching view component. No URL parsing or history API interaction happens inside the shell; that is entirely the router middleware's domain.

### 4.2 Toast lifecycle

The shell observes a single store slice that represents the "current toast". When that slice holds a non-empty string the toast element is opened and its text is set to that string. When the slice is cleared (set to null or empty string) the toast closes. The shell does not own any logic for dismissing or queuing toasts; it is a pure read-through to the store. The toast is shown with an indefinite duration - it stays on screen until the store clears it.

### 4.3 Spotify SDK injection

The shell passes the playback-master boolean down to a helper component (named something like "load script once") that handles conditional script injection. When the flag transitions from false to true the helper appends a script element pointing at the Spotify Web Playback SDK URL on Spotify's CDN. When the flag is false the script is not injected. The "once" semantics mean the script is injected at most one time per page load even if the flag toggles.

### 4.4 Theme and global styles

The shell declares its own scoped CSS that sets the application color palette (a dark background, a red primary accent, white primary text, and a muted secondary text color). It also sets the root element to full-viewport-height flex column layout. These styles live in shadow DOM scope and do not bleed out to child views. The icon sprite set is rendered as a direct child of the shell template so that all views can reference icons by id.

---

## 5. Layout and visual treatment

The shell itself is invisible as chrome. Its layout establishes the full-screen dark background and centers its child on the viewport main axis. There is no navigation bar, sidebar, or modal overlay hosted at this level.

    +----------------------------------------------------+
    |  Shell root (full viewport, dark bg, flex-column)  |
    |                                                    |
    |  [ Active view occupies all available space ]      |
    |                                                    |
    |  [ Icon sprite (hidden, referenced by id)  ]      |
    |                                                    |
    |  [ Toast (fixed, bottom of screen when open) ]     |
    |                                                    |
    |  [ Spotify script tag (invisible) ]                |
    +----------------------------------------------------+

The toast appears at the bottom of the viewport with a red background matching the primary accent color and a strong drop shadow.

---

## 6. HeroUI primitive candidates

Because the shell renders no interactive chrome, the HeroUI component surface is minimal.

- **Toast / notification banner** - HeroUI v3 ships a Toast component. This is the strongest mapping candidate. The implementer should call `get_component_docs` for Toast on the heroui-react MCP before building a custom implementation. Key behaviors to replicate: programmatic open/close driven by store state; indefinite duration (no auto-dismiss); text content passed as a prop; visual style matching the CrowdTune red accent.
- **Full-viewport wrapper** - this is raw Tailwind layout (`min-h-screen flex flex-col`) on the root element, not a HeroUI primitive.
- **Icon sprite host** - not a HeroUI concern; handled by whatever SVG sprite strategy CrowdTune uses (likely an existing shared utility).
- **Conditional script loader** - not a UI primitive; implemented as a React side-effect inside a component or custom hook.

---

## 7. Side effects

- **Spotify CDN script injection** - when the playback-master flag becomes true, a `<script>` element is appended to the document head pointing at `https://sdk.scdn.co/spotify-player.js`. This is a network request to Spotify's infrastructure. The script registers a global callback on `window` and sets up the Spotify Web Playback SDK. This side effect is conditional and fires at most once per page session.
- **No other network calls** originate from the shell itself. All data fetching is performed inside child views or in Redux sagas/middleware.

---

## 8. Reuse from prior ports vs new code needed

| Festify responsibility | CrowdTune equivalent | Verdict |
|---|---|---|
| Route resolution (read route from store, render matching view) | TanStack Router file-based routes in `apps/web/src/routes/` plus `__root.tsx` root layout; routing state is owned by TanStack Router, not Redux. The `<Outlet />` in `__root.tsx` renders whichever route matches. | COVERED |
| Default-to-home fallback when no route matches | TanStack Router's `notFoundComponent` or a catch-all `$` route at the root level. Already supported by TanStack Router conventions. | COVERED |
| Dark background + full-viewport-height flex-column layout | `<html class="dark">` in `index.html` plus HeroUI CSS-theme import in `app/styles/index.css` supply the dark theme. Root layout min-height and flex setup belongs in `__root.tsx` or `index.html` body styles. | COVERED (verify `__root.tsx` sets `min-h-screen` on its wrapper; if not, one Tailwind class addition to the root layout suffices - trivial, not a new port) |
| Application-wide color palette / CSS custom properties | HeroUI v3 theme tokens plus Tailwind 4 design tokens in `app/styles/index.css`. No custom palette declaration needed at app-shell level; HeroUI dark theme supplies the equivalent. | COVERED |
| Icon sprite host | Out of scope for this translation (see section 12). | OUT OF SCOPE |
| Global toast / snackbar wired to store | No existing application-wide toast host has been ported yet. The party-share and party-settings ports may surface per-page toasts, but a store-driven global toast manager at the root layout level does not currently exist in CrowdTune. | NOT COVERED - gap |
| Spotify Web Playback SDK conditional injection | The playback-master / Spotify SDK integration has not been ported yet. This is a separate concern from the app-shell layout but the shell is the host for the injection trigger. | NOT COVERED - separate concern; flag for the playback port, not the shell port |
| Theme / provider mounting (Redux, Polymer, fit-html) | `NeonAuthProvider` in `app/providers/` covers auth provider mounting. Redux is replaced by Zustand + TanStack Query. Polymer and fit-html have no equivalent. | COVERED (by our own stack; no Polymer/Redux mounting needed) |
| Service-worker registration | Not present in this file at all. Not a shell responsibility in Festify. | N/A |

---

## 9. Lock-now decisions

1. **Doc-only resolution for routing, theme, and provider concerns.** TanStack Router, HeroUI CSS theme, and NeonAuthProvider together cover everything the Festify app-shell does for routing dispatch, default-route fallback, dark theme, and provider mounting. No new code is required for those responsibilities.

2. **One minor layout verification required, not a full port.** The `__root.tsx` root layout should ensure its outermost wrapper carries `min-h-screen` and `flex flex-col`. This is a one-line Tailwind addition if absent, not a new component. It should be confirmed (not ported) as part of the next routine review of `__root.tsx`.

3. **Global toast host is a genuine gap but is NOT part of the app-shell port.** The Festify app-shell happens to host the global toast, but in CrowdTune the correct location for an application-wide notification system is a dedicated feature slice (for example `features/notifications/`) that registers a toast host inside `__root.tsx`. This should be filed as its own work item and not bundled into an app-shell port. The toast behavior in Festify is simple: one visible toast at a time, no queue rendered to the user, indefinite duration, store-driven open/close.

4. **Spotify SDK injection is not an app-shell concern for CrowdTune.** The decision of where to inject the Spotify player script belongs to the playback feature port, not to a root shell component. When the playback feature is ported, a React effect or a lazy-loaded module in the playback widget should handle SDK injection. The app-shell should not carry this responsibility.

5. **Overall resolution: doc-only, with two follow-up items filed as separate work.** No new app-shell component needs to be created. The orchestrator should close this as a doc-only port and open two separate work items: (a) verify `__root.tsx` min-h-screen layout, (b) design the global notification/toast system as an independent feature.

---

## 10. Open questions

1. Does `apps/web/src/routes/__root.tsx` currently set `min-h-screen flex flex-col` on its wrapper element? If not, is a one-line addition the right fix, or should the body element in `index.html` carry that style? Needs a quick look from the implementer before closing.

2. Should the global toast system use HeroUI's Toast component directly, or should it use a third-party notification library (such as Sonner, which is React 19-compatible and common in Vite projects)? HeroUI v3 Toast is the preferred answer per project rules, but the implementer should check `get_component_docs` to confirm HeroUI Toast supports programmatic/imperative open calls from a Zustand store subscription before committing.

3. The Festify toast has an indefinite duration (it stays open until dismissed programmatically). HeroUI's Toast component may default to auto-dismiss. The implementer of the notification feature needs to confirm whether HeroUI Toast supports duration control or whether a custom duration-off configuration is needed.

4. Festify's toast slice holds at most one active toast string. Should CrowdTune support a FIFO queue of notifications (show them one after another) or strict single-active behavior matching Festify? This is a product decision, not a translation decision.

5. The TV view is one of the three route targets in the Festify shell. Has the TV view (`view-tv.ts`) been translated yet? If not, TanStack Router should still have a route placeholder for it. The orchestrator should confirm the TV route spec status.

---

## 11. Tests to write

Not applicable. This port resolves as doc-only. No new code is produced. Tests for the global notification system and for the playback SDK injection will be specified in their respective feature ports.

---

## 12. Out of scope

- **Polymer custom element registration** (`customElements.define`) - React components are not registered; they are imported and composed. No equivalent is needed.
- **fit-html `connect` / `withStore`** - replaced entirely by TanStack Query + Zustand in our stack. No direct equivalent needed at the shell level.
- **Redux router middleware** - TanStack Router owns routing state; no Redux router slice exists in CrowdTune.
- **Polymer shadow DOM scoped styles** - CrowdTune uses Tailwind 4 utility classes and HeroUI theme tokens. No scoped style tag is needed at the root component level.
- **SVG icon sprite (`iconSet`)** - icon strategy (HeroIcons, Lucide, or an SVG sprite) is a shared-layer concern already decided for CrowdTune. Not part of this app-shell translation.
- **`load-script-once` Polymer helper component** - this small helper is covered as a React `useEffect` when the playback feature is ported. It is a dependency of the app-shell only by coincidence of hosting; it should be specced alongside the playback feature, not here.
- **LGPLv3 Festify copyright, author attributions, and license text** - none reproduced.
