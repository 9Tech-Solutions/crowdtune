# Spec: Party Share Sub-View

Translation source: Festify `views/party-share.ts` (plus companion saga `sagas/view-party-share.ts`)
Translation date: 2026-05-12
Status: Fourteenth UI port. This is the host-facing share sub-view of the party page. It mounts at `/party/$partyId/share` and is reached via the QueueDrawer's share navigation link.

---

## 1. Purpose

This view gives the host of a live music session a simple, scannable panel that tells guests how to join the party. It displays the domain guests should navigate to and the party's short join code they must enter there. On devices that support the browser's native share sheet (the Web Share API), a Share button also appears, letting the host invoke the operating system's native sharing mechanism to send the join link to guests via any installed app - messages, email, social apps, etc. The view requires no complex configuration: it is intentionally minimal. Its sole job is to surface the join information prominently so the host can show it on a screen or tap Share to distribute it.

---

## 2. Public Contract

### 2a. Inputs

The party-share widget receives or derives the following from its environment:

| Input | Type | Required | Description and valid values |
|---|---|---|---|
| Party identifier | String | Yes | The URL path segment identifying the current party session (the short identifier used in the party's join URL). Read from the URL by the widget itself via TanStack Router's `useParams` hook with `from: '/party/$partyId'`. NOT passed as a React prop from the route file. Never null while this view is mounted. This is the same identifier that appears in the shareable URL constructed for the Web Share payload. |
| Current party data | Party record or null | Yes | Provides the party's display name (used in the Web Share payload title and body text) and the party's short join code (displayed as the human-readable code guests enter on the join page). Read from the TanStack Query cache already warmed by the party page shell. The cache key is `['party', partyId]`. Null while the party record is still loading. |
| Authenticated user identity | String or null | Yes | The current user's identifier from the session (the JWT sub claim), read from `@/shared/auth`. Used for the host-gate check by comparing against `party.createdBy`. |
| Web Share API availability | Boolean | Yes (derived at runtime) | Whether the current browser and platform expose a functional Web Share API. Derived at render time by checking whether the browser's share function is callable. This is NOT a stored preference; it is re-evaluated each render from the browser environment. When true, the Share button is rendered. When false, the Share button is omitted entirely. |
| Application origin | String | Yes (derived at runtime) | The protocol and hostname of the running app (e.g. "crowdtune.app"). Read from the browser's location object at render time. Displayed in the description text so guests know which URL to visit. Also used to construct the full join URL included in the Web Share payload. |

### 2b. Outputs, events, and responses

The sub-view itself emits no domain events outward. Visible outputs to the user are:

- A descriptive paragraph telling guests to navigate to the application domain and enter the join code. The domain is displayed inline within the paragraph text with a distinct visual treatment (underlined, non-wrapping) so guests can pick it out at a glance.
- The party's short join code displayed in large, centered text. The join code is selectable so guests viewing on the host's screen can copy it manually if needed.
- Conditionally: a Share button, shown only when the browser supports the Web Share API. Tapping it invokes the native share sheet.

### 2c. State observed (read from shared application state)

- **Party data**: the full Party record including `name`, `createdBy`, and `shortId` (the join code). Read from the TanStack Query cache keyed by the party identifier. Already warmed by the party page shell.
- **Authentication state**: the current user's identifier. Read from `@/shared/auth`. Used only for the host-gate check.
- **Browser environment**: the availability of the Web Share API and the current application origin. Derived from `navigator` and `location` at render time, not stored in any application state layer.

### 2d. State mutated

This view mutates no persistent application state. The Web Share action invokes the browser's native share sheet; the user's choice within that sheet (which app to send to, what to write) occurs entirely outside CrowdTune and is not tracked or stored.

---

## 3. Behavior

### Host-gate check

When the view mounts, it checks whether the authenticated user's identifier matches `party.createdBy`. If the party record is still loading (null), the view renders a loading indicator rather than an unauthorized message, so there is no flash of incorrect content. Once the party record is available, if the current user is not the host, the view renders an unauthorized message and no share affordances. The check is defensive; the QueueDrawer already hides the share link from non-hosts.

### Loading state

While `party` is null (the TanStack Query cache has not yet resolved), a full-panel loading indicator is shown. No join code or share button is rendered in this state.

### Ready state layout

When the party record is available and the current user is confirmed as the host, the view renders its content with comfortable padding on all sides. The layout is a simple single-column flow:

First, a descriptive paragraph is shown. The paragraph tells guests to add new songs to the queue by searching, or to visit the application domain and enter the code shown below. The domain portion of the text is rendered inline with an underline and is set to not wrap (it stays on one line even if it is long), making it easy to read at a glance. The paragraph text and the domain value to inject are described in section 6 under open question 1.

Second, directly below the paragraph, the party's short join code is displayed in large text (significantly larger than the body text - approximately 32 px equivalent). The code is centered and user-selectable so guests can tap or click to copy it on devices where that is convenient.

Third, conditionally, a Share button appears. It is shown only when the Web Share API is available. When shown, it is a raised/filled button. No icon is specified in the source; an icon is a CrowdTune-original addition if desired - mark for product copy review.

### Share button tap

When the host taps the Share button, the view invokes the browser's native Web Share API with the following payload:

- A title set to the party's display name.
- A body text string that invites guests to join the party and "rule the music". The exact phrase is sourced from the Festify saga: "Join [party name] and rule the music!" - this string contains the party's live name interpolated. Mark for product copy review: CrowdTune may want to adapt this copy before ship.
- A URL constructed from the application origin concatenated with the party path segment, forming a full absolute URL such as `https://crowdtune.app/party/[partyId]`. This is the direct join link for the party.

The Web Share API call is asynchronous. The source does not show any loading state during the share operation, and no success or error feedback is shown in the view after the share sheet closes. The host simply sees the native OS share sheet appear and can proceed from there. If the share call rejects (the user dismisses the sheet, or the API fails), no error toast is shown and the view returns silently to its ready state.

### No auto-save, no mutations

This view has no form fields and makes no mutations to party data, queue data, or any other backend resource. It is a read-only display panel.

### State transitions summary

- Loading (party data not yet available): full-panel loading indicator, no join code, no button.
- Unauthorized (current user is not the host): unauthorized message, no share affordances.
- Ready, Web Share unavailable: description paragraph + join code; no Share button.
- Ready, Web Share available: description paragraph + join code + Share button.
- Share sheet open (after button tap): native OS overlay; view is visually unchanged behind it.
- Share sheet closed (success or dismiss): view returns to Ready state; no visible change.

---

## 4. Side Effects

### Web Share API invocation

When the host taps Share, the widget calls the browser's native share function with the payload described in section 3. This is a browser API call, not a network call to CrowdTune's backend. The OS handles all routing of the share to whatever app the user selects. CrowdTune has no visibility into whether the share was actually sent or received by any guest.

The source's saga guards against invoking the share function on platforms that do not support it by checking availability before registering the listener. The CrowdTune widget replicates this by only rendering the Share button when availability is confirmed, making the invocation path dead-code-safe.

### No network calls

This view issues no fetch, mutation, or query of its own. The party data comes from the warmed TanStack Query cache. There is no placeholder hook needed for this port because no backend endpoint is called.

### No audio output

This view makes no use of the Spotify Web Playback SDK and produces no audio output.

### No real-time subscription

The view does not open any real-time subscription. Party data is already subscribed at the party page shell level.

---

## 5. Edge Cases Worth Preserving

- **Party data still loading**: the widget must not flash an unauthorized message before the party record arrives. Render a loading indicator until `party` is non-null, then evaluate the host check. This matches the pattern established by party-settings.

- **Web Share API absent**: on desktop browsers and on some mobile browsers that have not implemented the API, the Share button is simply not rendered. The description paragraph and join code are still shown. The view remains useful without the button.

- **Web Share API present but share rejected**: if the host taps Share and the native sheet appears but the host dismisses it without sharing (or the API rejects for any platform reason), the widget returns to the ready state with no toast or error message. Festify's saga does not handle the rejection either. This is acceptable behavior for a soft-fail share action.

- **Short join code is empty**: if `party.shortId` (or the equivalent field on the Party entity) resolves to an empty string, the join code display area shows nothing (or a dash/placeholder). This should not occur in practice since the backend always assigns a short code on party creation, but the widget must not crash if the field is unexpectedly absent. A defensive fallback of an em-dash or a loading indicator in that slot is appropriate.

- **Very long domain name**: the domain text is set to not wrap in the source (white-space: nowrap). On a very small screen this could cause horizontal overflow. The CrowdTune port should respect the nowrap intent but apply an overflow-hidden or text-ellipsis clip on the inline span rather than letting it break the page layout. Mark for implementer decision.

- **Party name contains special characters or is very long**: the Web Share payload embeds the party name in the title and in the body text string. No sanitization is needed since the Web Share API handles encoding, but the widget should not crash if the party name is extremely long or contains emoji.

- **Non-host navigates directly to the route**: if a guest or logged-out user somehow navigates to `/party/$partyId/share`, the host-gate check catches this and renders the unauthorized message. No join code or share button is exposed.

- **Auth identity not yet resolved**: if the `@/shared/auth` hook has not yet resolved the current user's identity (the JWT is being validated or the session is initializing), treat the identity as null and hold the loading indicator rather than flashing unauthorized. Once identity resolves, re-evaluate the host check.

---

## 6. Open Questions for the Implementer

1. **Description paragraph copy**: the source contains a specific phrase: "Add new songs to the queue by searching for them or ask your guests to go to [domain] and enter this code:". This is Festify's original English copy. The CrowdTune port must use its own wording. Proposed CrowdTune-original copy: "Guests can search and add songs directly, or visit [domain] and enter this code to join:" - mark for product copy review. The domain value is injected at render time from the browser location.

2. **Web Share body text**: the saga composes the share body as "Join [party name] and rule the music!" which is Festify's brand voice. CrowdTune needs its own phrase. Proposed CrowdTune-original copy: "Join [party name] on CrowdTune and help choose the music!" - mark for product copy review. The party name is interpolated at call time from the cached party record.

3. **Share button label and icon**: the source uses a text-only "Share" label. The CrowdTune HeroUI port may benefit from an icon alongside the label (a share/upload icon). Whether to include an icon and which one to use is a product decision. Proposed label: "Share" - mark for product copy review. The implementer should query `get_component_docs` for Button on the `heroui-react` MCP to confirm startContent/endContent icon support.

4. **Share button error handling**: Festify's saga does not catch errors from the Web Share API call (a dismissed share sheet causes the promise to reject in most browser implementations). The CrowdTune port should add a try/catch around the share invocation and log the error via `console.warn` as the interim fallback, matching the project's established placeholder feedback pattern. A user-visible toast on share dismissal is NOT recommended (it would be noisy), but a caught rejection should not bubble as an unhandled promise rejection. The implementer should wrap the call in a try/catch and swallow the error silently.

5. **Join code field name on the Party entity**: the view displays `currentParty.short_id` from Festify's Firebase model. The CrowdTune Party entity (already shipped at `@/entities/party`) may use a different field name for the join code. The implementer must confirm the correct field name from the existing entity type rather than introducing a new one. If the Party entity does not yet carry a short join code field, that is a gap to record in `docs/translation-progress.md` and fill before this port ships.

6. **partyId vs. short_id in the share URL**: in the Festify source, the share URL uses the router param (`partyId`, the short identifier extracted from the URL), while the displayed join code is `currentParty.short_id`. In Festify's Firebase model these were distinct fields - the router param was derived from the Firebase document key, while `short_id` was a shorter, friendlier code stored separately. In the CrowdTune model, confirm whether the URL segment and the displayed join code are the same value or different values. If they are the same, use `partyId` (from `useParams`) for both the display and the URL. If they are different, the Party entity must expose both and the widget must use each for its correct purpose. This distinction matters for the shareable URL to resolve correctly.

7. **Unauthorized message copy**: the host-gate check renders an unauthorized message for non-hosts. Proposed CrowdTune-original message: "Only the party host can view share options." - mark for product copy review. This matches the defensive-gate pattern established by party-settings.

8. **Loading indicator form**: the source does not specify a loading state (the party is always assumed ready in the original Festify flow). The CrowdTune port must decide whether to show a full-panel spinner, a skeleton of the join code display, or a minimal inline spinner. The recommendation is a centered HeroUI Spinner, matching the loading state pattern used in party-settings. Implementer should query `get_component_docs` for Spinner on the `heroui-react` MCP.

---

## 7. Stack Mapping Notes

### Lock-now decisions for this port

**FSD placement - widget, not page**: the share sub-view is a sub-route of the party page and requires no independent data queries beyond the already-warmed party cache. It adds no new mutation hooks. The correct FSD placement follows the same rationale used for prior party sub-view widgets:

- Component: `apps/web/src/widgets/party-share/ui/PartyShare.tsx`
- Public barrel: `apps/web/src/widgets/party-share/index.ts`
- Route binding: a thin route file at `apps/web/src/routes/party.$partyId.share.tsx` that imports `PartyShare` from `@/widgets/party-share` and binds it via `createFileRoute`. No business logic in the route file.

**Widget reads `partyId` via `useParams`**: the route file passes NO props. The widget calls `useParams({ from: '/party/$partyId' })` internally. This is locked to match the pattern established by all prior party sub-view widgets.

**No placeholder API hooks needed**: unlike party-settings or party-track-search, this widget makes no backend calls. The `api/` subdirectory of the widget slice may be omitted, or it may contain only a single re-export if the FSD tooling requires it. There is no `useShareParty` mutation hook; the Web Share API is invoked inline in the component's event handler. The `model/` subdirectory may also be minimal (no Zustand store slice needed; no local state beyond what a single `useState` for a hypothetical share-in-progress flag provides).

**Web Share API detection**: the availability check must be evaluated inside the component body (or a custom `useWebShare` hook) at render time, not in a module-level side effect. This ensures server-side rendering compatibility and avoids stale values if the browser upgrades support mid-session (unlikely but sound). The hook returns a boolean `isSupported` and an async `share(payload)` function that wraps the native call in try/catch.

**Component shape**: function component, fully controlled. No Zustand reads beyond what `@/shared/auth` exposes for the host-gate check. All party data comes from TanStack Query's `useQuery` with the `['party', partyId]` cache key (already warmed). Local state holds only a share-in-progress boolean if the implementer decides to show any visual feedback during the async share call (not required by the source, but the try/catch wrapper makes it low-cost).

**HeroUI primitives**: the implementer must call `list_components` and then `get_component_docs` on the `heroui-react` MCP before implementing. Candidates to query:

- Button (for the Share button when Web Share is available; confirm startContent/endContent icon support and `variant` options for a raised/filled appearance).
- Spinner (for the loading state while party data is resolving).
- The description paragraph and join code display are simple typographic elements; no dedicated HeroUI component is needed. Use standard HTML elements styled with Tailwind utilities for the large join code display.

Do not hand-roll any of these from raw Tailwind if HeroUI provides a first-class component.

**No dangerous or destructive actions**: this view has no flush, delete, or mutate operations. No confirmation dialog is needed.

### Accessibility requirements

- The join code display region should carry `aria-label="Party join code"` or an equivalent accessible label so screen reader users understand what the large text represents. CrowdTune-original proposed label: "Party join code" - mark for product copy review.
- The join code text must be user-selectable (CSS `user-select: text`) so keyboard users can select and copy it. This is explicitly specified in the source styles and must be preserved.
- The Share button, when present, must have a descriptive accessible name. If the button is labeled "Share" visually, the accessible name is sufficient as-is, but if only an icon is used, an `aria-label` must be added. Proposed accessible name: "Share party join link" - mark for product copy review.
- The domain name within the description paragraph should be wrapped in a `<span>` with a meaningful `aria-label` if it is styled in a way that changes its reading order or visual presentation significantly.
- While the party is loading, the widget must render an accessible loading state. The HeroUI Spinner should be accompanied by a visually hidden status text. CrowdTune-original proposed text: "Loading party details..." - mark for product copy review. The loading region should carry `aria-busy="true"` and `role="status"`.
- The unauthorized message must be rendered as a visible text element with sufficient color contrast. It should not be hidden from assistive technologies.

### Polymer and web-component concepts not carried forward

The source registers a custom HTML element using a framework-specific connect wrapper that binds a Redux state selector and a dispatch map to a lit-html template function. None of that applies in CrowdTune. The share sub-view is a plain React function component. There is no custom element registration, no shadow DOM, no lit-html template literals, no Redux dispatch mapping, no redux-saga effect runner, and no paper-button Polymer primitive. The Web Share invocation that was previously handled by a saga is now an inline async call in the component's event handler (wrapped in try/catch).

### Dependency summary

- `Party` entity type from `@/entities/party/model/types` (already shipped; needs `name`, `createdBy`, and the short join code field - see open question 5).
- `@/shared/auth` for the current user's identifier (for host-gate check).
- TanStack Router `useParams` (for `partyId`).
- TanStack Query `useQuery` (for the party cache read; no mutation hooks needed).
- HeroUI Button, Spinner (confirm exact API via `heroui-react` MCP before implementing).
- Browser globals `navigator.share` and `window.location.origin` (accessed inside the component or a `useWebShare` hook; not imported).
- Does NOT import from any other widget or entity beyond `@/entities/party` and `@/shared/auth`.
- Does NOT require a saga, a redux-saga runner, or any equivalent polling mechanism.
- Does NOT require a backend endpoint or a placeholder API hook for the first port.
- Depends on a toast notification mechanism at the party page shell level only if the implementer adds error feedback for share failures. Per the recommendation in open question 4, the share rejection should be swallowed silently with a `console.warn`; no toast is needed for this port.
