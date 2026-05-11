# Spec: Home / Join Page (translated from views/view-home)

## 1. Purpose

This page is the application's public entry point. It is visible to anyone who opens CrowdTune without navigating to a specific party URL. Its sole job is to get a user into a party as quickly as possible: either by typing a party code to join an existing party, or by creating a brand-new party as a host. The page is not an authenticated dashboard - it shows no list of past parties, no user profile, and no song data. It is purely transactional: type a code, press join; or press create, and the app sends the user somewhere useful.

The page serves two distinct user populations simultaneously:

- A guest who received a party code from a host and wants to join. This user may be completely unauthenticated and still successfully join.
- A host who wants to start a new party. This user must be authenticated and must have a connected Spotify account with a Premium subscription before the backend will accept the create request.

The page adapts its lower action area based on the user's current authentication and Spotify-connection state, but it does not hide the join form or redirect anyone away. Every visitor, regardless of auth state, lands on the same page and sees the join form first.

## 2. Public Contract

### Inputs

- **Party code field**: a short alphanumeric or numeric string entered by the user to identify an existing party. Required for the join flow; ignored for the create flow. The field is numeric-friendly on mobile (keyboard hint equivalent to a telephone-number input). The page tracks the current value of this field in local state and derives a validity flag from it.
- **Party code validity**: derived from the typed value; at minimum the value must be non-empty and conform to whatever format the backend expects (exact format is an open question - see section 6). The join button is disabled when this validity flag is false.
- **Auth status**: the page reads from the session whether the user is signed in and, separately, whether their Spotify connection is active and carries a Premium product tier. This is not a form input - it is observed state from the auth and Spotify layers.
- **Spotify connection status**: whether the current user has a linked Spotify account with Premium access. Determines which lower button variant is rendered.
- **Browser playback compatibility**: a flag indicating whether the current browser can run the Spotify Web Playback SDK. On incompatible browsers, the host-creation affordance is hidden entirely. This prevents a host from creating a party they cannot actually play music in.
- **In-progress flags**: the page observes two loading states externally - one for party join in progress, one for party creation in progress, and one for Spotify authorization in progress. These disable or relabel buttons during async operations.

### Outputs / Events / Responses

- **Navigation to party page**: on successful join or successful create, the page navigates to `/party/$partyId` using TanStack Router, carrying the newly obtained or entered party ID.
- **Callback: onJoinParty(partyCode: string)**: fired when the user submits the join form. The caller (page-level data hook) performs the lookup and resolves the party ID before navigating.
- **Callback: onCreateParty()**: fired when the authenticated Premium host presses "Create Party". The caller performs the backend mutation.
- **Callback: onConnectSpotify()**: fired when a signed-in user who lacks a Spotify Premium connection presses the connect / login button. The caller initiates the Spotify OAuth flow. This component does not own the OAuth logic; it exposes only the trigger.
- **Callback: onSignIn()**: fired when an unauthenticated user presses the button that would otherwise be "Create Party". The caller routes to `/auth/$` with a return URL pointing back to the home page.
- **Error display**: when a join attempt fails, an inline error message appears near the join button explaining why (party not found, party expired, party at capacity, or generic network failure). When a create attempt fails, a similar inline error appears near the create button.

### State Observed

- Current typed party code and its derived validity (local component state or a shallow Zustand slice dedicated to this view).
- Whether the user is currently signed in (from the Neon Auth session via `@/shared/auth`).
- Whether the user has a Spotify Premium connection active (from a Zustand slice or TanStack Query result backed by `GET /api/spotify/token` or equivalent).
- Whether the browser supports Spotify Web Playback (detected once at startup, stored in a global capability slice or a module-level constant derived from feature detection).
- In-progress and error states for the join and create async operations (local or from mutation state returned by TanStack Query mutations).
- In-progress state for Spotify authorization (from the Spotify OAuth slice, if the OAuth flow is happening in-tab).

### State Mutated

- The typed party code field value (local state only; cleared on successful join).
- The join mutation's loading and error state (managed by TanStack Query mutation).
- The create mutation's loading and error state (managed by TanStack Query mutation).

## 3. Behavior

**All visible button labels in this section are CrowdTune-original copy proposed by the translator** (not Festify verbatim): "Join Party", "Joining...", "Create Party", "Creating...", "Authorizing...", "Sign in to create Party". The implementer should use them as-is unless product requests changes.

### Initial render

The page renders a centered, full-viewport-height layout. At the top is the brand wordmark ("CrowdTune" as text until an SVG mark lands). Below it is a brief functional description of the app - one short sentence, not marketing copy. Below that is the main interactive panel.

The main panel contains, in order from top to bottom:

1. A party code input field.
2. A "Join Party" button.
3. A lower action button whose content varies by state (described below).

The join button is disabled on initial render because the party code field is empty and therefore invalid.

### Party code input

As the user types into the party code field, the page updates the stored value character by character. If the resulting value passes the validity check, the join button becomes enabled. If the user clears the field, the button disables again. The field accepts a numeric-style keyboard hint on mobile to make entering a numeric code easier.

When the party code field is focused and the user presses Enter while the code is valid, the page fires the join action immediately without requiring a button click.

### Join flow

When the user presses "Join Party" (or presses Enter with a valid code), the button changes its label to "Joining..." and becomes disabled. The party code field also becomes non-interactive during this period. If the lookup succeeds, the page navigates to `/party/$partyId`. If it fails, the loading state clears and an error message appears below the join button explaining the failure. The field and button return to their previous state so the user can correct the code and retry.

The join flow does not require the user to be signed in. An unauthenticated guest can join a party by code.

### Lower action button - the four states

The lower button (below "Join Party") renders differently depending on four mutually exclusive conditions, evaluated in priority order:

1. **Party creation in progress**: the button is disabled and shows a "Creating..." label. This is a transient state reached only after the user has already triggered the create action.

2. **Authenticated with Spotify Premium confirmed**: the button is enabled and shows "Create Party". Pressing it fires the create action. The create action calls the backend to allocate a new party, then navigates the user to `/party/$partyId` for the newly created party.

3. **Auth status unknown or Spotify authorization in progress**: the button is disabled and shows "Authorizing..." or "Checking..." (exact label is an open question - see section 6). This prevents the user from pressing create before the app knows whether they are eligible.

4. **Not authenticated, or authenticated but Spotify not Premium**: the button is enabled but its action is not create - it initiates sign-in. The label is "Sign in to create Party" or equivalent. Pressing it fires `onSignIn()`, which routes to `/auth/$` with a `redirectTo` parameter pointing back to the home page, so that after sign-in the user lands back here and can proceed.

If the browser is not playback-compatible, none of these four button variants is rendered at all. The create path is structurally unavailable on incompatible browsers.

### Spotify connection after sign-in

A user who has signed in via Neon Auth but has not yet connected Spotify sees the "not authenticated / not Premium" state (state 4 above), which prompts them to connect Spotify. Pressing that button fires `onConnectSpotify()`. After the Spotify OAuth flow completes and the Spotify Premium tier is confirmed, the page re-evaluates the lower button condition and transitions to state 2, enabling "Create Party".

### Create party flow

When the user presses "Create Party", the button transitions to state 1 ("Creating..."). The create mutation calls `POST /api/parties` (or equivalent; the backend endpoint is not yet built as of this spec). On success, the response includes the new party's ID, and the page navigates to `/party/$partyId`. On failure, an inline error appears near the create button and the button returns to state 2 so the user can retry.

### Error display

Errors from both the join and create flows are displayed inline within the main panel, positioned immediately below the button that triggered them. Each error message is brief and user-facing (not a raw HTTP status or stack trace). Errors clear automatically when the user retries (initiates the action again) or modifies the party code input.

## 4. Side Effects

- **Party join lookup**: when the join action fires, the page (via its data hook) makes a request to the backend to resolve the party code to a party ID and confirm the party is joinable. The exact endpoint is not yet specced; the hook returns the party ID on success or a typed error on failure.
- **Party create**: when the create action fires, the page (via its data hook) makes a `POST` request to create a new party under the authenticated user's account. Returns the new party ID on success.
- **Spotify OAuth redirect**: when `onConnectSpotify()` fires, the app initiates the Spotify authorization code flow. This is a full-page redirect or a pop-up window depending on how Phase 9b.2 implements the OAuth handler. The home page component itself does not perform the redirect - it only exposes the callback.
- **Navigation**: both successful join and successful create trigger TanStack Router navigation to `/party/$partyId`. No browser history manipulation beyond standard push-navigation.
- **Browser capability detection**: on mount, the page (or a shared utility it calls once) checks whether the current browser environment supports the Spotify Web Playback SDK. This check is synchronous and does not make any network request. The result gates the lower button section.

## 5. Edge Cases Worth Preserving

- **Empty party code**: the join button must be disabled whenever the code field is empty or the code fails the format check. Pressing join with an empty code must be impossible without JavaScript gymnastics.
- **Invalid party code format**: if the user types a value that does not match the expected format (for example, too short, contains invalid characters), the join button remains disabled. No server round-trip is made for format-invalid codes.
- **Party not found**: the backend returns a not-found error. The page shows a message like "Party not found. Check the code and try again." The field is re-enabled.
- **Party expired or ended**: the backend returns a specific error indicating the party is over. The page shows a distinct message from "not found" since the cause and remedy are different.
- **Simultaneous in-progress states**: only one of join-in-progress or create-in-progress can be true at a time. The UI should prevent initiating a second action while one is pending.
- **Auth state unknown on first load**: before the Neon Auth session check resolves, the lower button shows the "Authorizing..." disabled state rather than jumping between "login" and "create". This prevents a flash of incorrect content.
- **Browser incompatibility**: on a browser where the Spotify SDK cannot run (certain mobile browsers, some older desktop browsers), the lower button is completely absent. The guest join flow still works normally on these browsers - only the host create path is gated.
- **Spotify auth completion returns to home**: after the Spotify OAuth flow completes, the user lands back on the home page. The page should immediately re-check Spotify status and render the correct lower button state without requiring a manual refresh. This implies the Spotify connection state is fetched reactively (for example, via a TanStack Query that refetches on window focus).
- **Network failure during create**: the create mutation fails at the network level (timeout, server error). The page shows a generic retry message and does not navigate.
- **Multiple rapid presses**: the join and create buttons should be disabled immediately on first press, preventing double-submission.

## 6. Open Questions for the Implementer

- **Party code format and validation**: the source treats the field as a telephone-number-style numeric input, implying party codes are all-numeric. The exact length and character set are not enforced in this file - they depend on how the backend generates codes. The implementer must confirm with the backend team what a valid party code looks like and encode that as a regex or Zod schema for client-side pre-validation before the network call is made.

- **"Authorizing..." label copy**: the source shows this label while auth status is unknown or a Spotify authorization is in progress. For CrowdTune the equivalent states are (a) session check pending and (b) Spotify OAuth in flight. The implementer should decide whether these two sub-states warrant different labels ("Checking..." vs "Connecting Spotify...") or a single "Please wait..." message.

- **Join endpoint shape**: the source calls a join action that accepts a party ID string. It is unclear whether the backend returns a canonical party ID that may differ from the entered code (for example, codes could be short aliases), or whether the entered value is used directly as the route parameter. The implementer should confirm the API contract with the backend team.

- **Create party endpoint**: as of this spec, `POST /api/parties` does not exist in the backend. The `useCreateParty` hook should be written as a placeholder mutation (no-op or mock) until the endpoint is built, mirroring how `usePartyQuery` was handled in the `PartyPage` port.

- **Spotify Premium check**: the Festify source performs a Premium-tier check on the Spotify user object using an account-tier field we do not yet have mapped in our stack. Our stack exposes Spotify credentials via `GET /api/spotify/token` (Phase 9b.2, queued; not yet built). Until that endpoint exposes the tier, the Premium check defaults to FALSE - the page treats every signed-in user as "not Premium" and renders the connect-Spotify lower-button state rather than the create state. The deferred concern (and the mapping decision for the tier field) is recorded in `docs/translation-progress.md` for the implementer to revisit when the credential read endpoint surfaces tier data.

- **Browser playback compatibility detection**: the source reads a `player.isCompatible` flag from Redux state that is set by a player initialization saga. In our stack there is no equivalent yet. The implementer should decide whether to (a) always show the create button and let the Spotify SDK initialization fail gracefully, (b) perform a synchronous feature-detection check on mount (checking for `window.MediaSource` and related APIs), or (c) hide the create button on known-incompatible platforms via user-agent sniffing as a temporary measure. Option (b) is recommended; flag for a separate platform-compat task.

- **QR code join alternative**: the context prompt asks whether CrowdTune should support QR code scanning in addition to manual code entry. The Festify source has no QR flow. This is a product decision: if QR is desired, a "Scan QR Code" secondary CTA should be added below the join button, opening the device camera. This spec does not include QR because Festify does not have it and it represents new scope. Flag for product review.

- **Recently joined / hosted parties list**: the context prompt asks whether the home page should show a list of past parties. Festify does not show this. For MVP this is out of scope, but the implementer should note that the layout's main panel has vertical room for a "Recent parties" section below the action buttons if the product team decides to add it in a future sprint.

- **HeroUI primitives**: the implementer must query `list_components` and `get_component_docs` on the `heroui-react` MCP before selecting specific components. Candidates include the Input component (for the party code field), Button, Card (for the main panel), and Spinner or a loading variant of Button for in-progress states. The Form component (if HeroUI v3 ships one) should be checked for built-in validation integration with Zod. Do not hand-roll input or button primitives when HeroUI ships them.

- **Party join error taxonomy**: the implementer should define a typed union of join error kinds (not-found, expired, at-capacity, network) so that error messages can be tailored per kind rather than showing a generic fallback for all failures.

## 7. Stack Mapping Notes

### Page collision decision: replace the existing HomePage

The existing `apps/web/src/pages/home/ui/HomePage.tsx` is a Phase 0 skeleton with the label "Phase 0 skeleton. No features yet." and a single "Sign in" link. It has no functional content. The Festify view-home port should replace it entirely, reusing the same file path (`apps/web/src/pages/home/ui/HomePage.tsx`) and the same TanStack Router route (`/`). There is no reason to keep the skeleton or land the port at a different path like `/join`. Rationale: the home page is the canonical entry point; the join and create flows belong there; and the skeleton's only affordance (a sign-in link) is superseded by the richer auth-aware lower button.

### FSD placement

- Page component: `apps/web/src/pages/home/ui/HomePage.tsx` (replaces the skeleton).
- Data hooks: `apps/web/src/pages/home/model/useJoinParty.ts` and `apps/web/src/pages/home/model/useCreateParty.ts`. These are TanStack Query mutation hooks. `useCreateParty` is a placeholder no-op mutation until `POST /api/parties` is built on the backend.
- Local state for the party code field: managed inside `HomePage.tsx` with `useState` (the value is ephemeral and view-local; it does not need a global store slice).
- Spotify connection status: read from a TanStack Query result keyed to `GET /api/spotify/token`. A dedicated `useSpotifyStatus` hook should live at `apps/web/src/entities/spotify/model/useSpotifyStatus.ts` so it can be reused by other components (for example, `PartyPage` may also need to know whether Spotify is connected). This is a separate translation task.
- Browser capability flag: a module-level constant or a tiny hook at `apps/web/src/shared/lib/usePlaybackCompatible.ts` that runs once on mount and returns a boolean.

### Polymer custom element to React function component

The source is a Polymer / lit-html custom element wired to Redux. The CrowdTune port is a React function component with no class syntax. All state is via hooks.

### Redux + actions to Zustand / TanStack Query

- `joinParty` action dispatched to a saga becomes a TanStack Query mutation in `useJoinParty`.
- `createPartyStart` action becomes a TanStack Query mutation in `useCreateParty`.
- `changePartyId` action updating a Redux slice becomes `useState` local to the component.
- `triggerOAuthLogin('spotify')` becomes the `onConnectSpotify` callback, which calls the Spotify OAuth initiation function from the auth layer (separate translation task).

### Firebase RTDB to Postgres / REST

No Firebase RTDB reads or writes happen on this page. The source dispatches actions that are handled by sagas elsewhere. In our stack the mutations call Gin REST endpoints directly.

### Auth integration

The page does not re-implement sign-in UI. The "Sign in to create Party" button fires `onSignIn()`, which navigates to `/auth/$` (the existing Neon Auth route at `apps/web/src/pages/auth/ui/AuthPage.tsx`) with a `redirectTo` query parameter pointing back to `/`. The `getSession` helper from `@/shared/auth` is called on mount (or via a TanStack Query) to determine the user's auth state.

### Spotify connection check before create

Before the "Create Party" button is shown, the component checks whether the user's Spotify account is connected and Premium. This check calls `useSpotifyStatus` (a separate entity, translation task not yet done). Until `useSpotifyStatus` is built, implement a named placeholder hook `useSpotifyStatusPlaceholder` (in the same `pages/home/model/` directory) that always returns `{ isConnected: false, isPremium: false }` with a docblock explaining the placeholder behavior. The HomePage imports the placeholder and renders the connect-Spotify lower-button state. NO `// TODO` comment; the deferred concern is recorded in `docs/translation-progress.md` instead.

### Brand wordmark

Text "CrowdTune" rendered as a heading element, not an SVG, until the brand mark asset is finalized. Consistent with the decision made in `QueueDrawer` and `PartyPage` ports.

### No marketing copy

The Festify source includes the tagline "Festify lets your guests choose which music should be played using their smartphones." This is Festify-specific marketing copy. It is dropped in the CrowdTune port. The page may include a single short functional description (one sentence, factual) if the product team decides one is needed for orientation, but no feature highlights, testimonials, or screenshot sections. This is an MVP entry point.

### Depends on these separate translation tasks (not yet done)

- A `useSpotifyStatus` hook that reads Spotify connection state from `GET /api/spotify/token`. Needed to gate the "Create Party" vs "Connect Spotify" button state.
- The Spotify OAuth initiation flow (the equivalent of the source's `triggerOAuthLogin('spotify')`). The home page calls `onConnectSpotify()` as a prop; the caller must wire it to the real OAuth handler when that task is complete.
- The `POST /api/parties` backend endpoint and corresponding Gin handler. The `useCreateParty` mutation is a stub until this lands.
- A `useJoinParty` mutation that calls the backend to resolve a party code. The endpoint shape (path, request body, response shape) needs a separate API design decision.
- A browser playback compatibility utility (`usePlaybackCompatible` or equivalent).
