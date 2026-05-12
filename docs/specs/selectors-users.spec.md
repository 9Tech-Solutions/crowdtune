# Spec: User Selectors

## 1. Source Provenance

Reference file: `src/selectors/users.ts` from the Festify project (LGPLv3).
This spec is a clean-room behavioral translation. No source code, identifiers, or copyrighted text from the reference have been reproduced.
Translation date: 2026-05-12.

---

## 2. Purpose and Scope

This file exposes two read-only selectors that answer user-identity questions needed by the rest of the Festify UI:

- **User display name** - resolves the best available human-readable label for the currently signed-in user: preferred display name if set, falling back to email address, falling back to an empty string, or null when no user is signed in at all.
- **Spotify account connected** - answers whether the current user has a Spotify credential on record, checking both the persisted in-app credential store and a browser-local fallback token.

In Festify both selectors read from a combination of the Firebase Auth SDK (called live at selector invocation time, not via Redux state) and a Redux slice that holds Spotify OAuth credentials. Neither selector takes input parameters; they are called with no arguments and pull all context from global/ambient state.

---

## 3. Each Selector's Contract

### 3a. User Display Name

- Input: none (reads ambient auth state from the Firebase Auth SDK at call time).
- Output: a string when any user is authenticated - the user's display name if one is set, otherwise the user's email address, otherwise an empty string. Returns null (not an empty string) when no user is authenticated at all.
- State observed: the live, currently-authenticated Firebase user object (name field and email field).
- State mutated: none.
- Synchronous. No network call at read time (Firebase Auth caches the current user locally).

The null-vs-empty-string distinction is deliberate: null means "no session", empty string means "session exists but no displayable label is available". Callers that only check truthiness will treat both as falsy; callers that care about the authentication state itself must check for null explicitly.

### 3b. Spotify Account Connected

- Input: none (reads Redux state and browser localStorage).
- Output: a boolean. True when either the in-app credential store contains a Spotify user record for the current session, or a Spotify OAuth token exists in browser localStorage under a known storage key. False when neither is present.
- State observed: the Spotify sub-object of the Redux user-credentials slice (specifically the Spotify user field within it); the browser localStorage entry for the Spotify OAuth token.
- State mutated: none.
- Synchronous.

The dual-source check (Redux AND localStorage) is a deliberate fallback: if the Redux store has not yet rehydrated (for example, on a fresh page load before Firebase has restored session state), the localStorage check still returns true so the UI does not briefly flash an "add Spotify" prompt at the host.

---

## 4. Reuse from Prior Ports vs New Code Needed

| Selector | Coverage verdict | CrowdTune equivalent |
|---|---|---|
| User display name | COVERED | `SessionUser.name` from `getSession()` in `@/shared/auth`. The name field is always populated by Neon Auth (Better Auth derives it from the OAuth provider's profile). No fallback chain needed. |
| Spotify account connected | COVERED | `SessionUser.id` being non-null (from `getSession()`) is sufficient to confirm a connected provider session; Neon Auth only creates a session after a successful OAuth handshake. For a more explicit check, `provider: 'spotify'` can be confirmed from the session's linked accounts list if Better Auth exposes it - but the current auth flow only allows Spotify sign-in, so an active session implies a connected Spotify account. No localStorage fallback needed or appropriate in our stack. |

Verdict: **doc-only resolution (fully covered)**. Neither selector requires a new function or a new entity slice. Both map directly onto fields already available on the `SessionUser` type returned by `getSession()`.

---

## 5. Lock-Now Decisions

### User display name

Use `session?.name` from the `SessionUser` object returned by `useSession()` (or the TanStack Query `['session']` cache). Do not implement a display-name selector function. The Better Auth / Neon Auth provider always populates `name` from the connected OAuth account; a three-way fallback chain is not needed.

If a component needs a guaranteed non-null display string (for avatar initials, etc.), apply a last-resort default inline: use `session?.name ?? session?.email ?? 'Guest'`. Keep this inline, not in a shared function, unless three or more components need it.

### Spotify account connected

Use the presence of a non-null `SessionUser` returned by `getSession()` as the indicator that a Spotify account is connected. Neon Auth does not create a session without a completed OAuth handshake, so session existence implies provider connectivity.

Do not introduce a localStorage-based fallback. Our stack does not store OAuth tokens in localStorage; the Better Auth session cookie and the JWT `sub` are the only session artifacts. A localStorage check would always return false and would create a maintenance hazard if localStorage key names change.

If future requirements demand checking whether a specific Spotify scope is still valid (for example, detecting a revoked refresh token), that check belongs in the Spotify API integration layer, not in a user selector. Flag for a separate task at that point.

---

## 6. Open Questions

1. **Display-name fallback depth.** Festify falls back to email if no display name is set. Neon Auth populates `name` from Spotify's `display_name` field, which Spotify itself may leave blank for some accounts. Confirm with the Neon Auth schema whether the `name` field can ever be null or empty in our user table (check the `neon_auth."user"` view). If it can, decide whether the UI should fall back to `email` or show a generic placeholder like "Guest".

2. **Multiple providers.** CrowdTune currently only allows Spotify sign-in, so "session exists implies Spotify connected" is a safe assumption. If a second OAuth provider is added later (for example, Apple or Google), the Spotify-connected check will need to read the specific provider list from the session rather than treating any session as Spotify-connected. Document this assumption in the auth layer when the second provider is added.

3. **Session loading state.** Both Festify selectors read synchronously from in-memory state. In our stack, `getSession()` is async and TanStack Query introduces a loading state before the `['session']` cache is populated. Components that conditionally render based on display name or "is signed in" must handle the `isLoading` state to avoid flashing a signed-out UI to an authenticated user. This is already the standard TanStack Query pattern but is worth flagging explicitly for any component that ports Festify UI relying on these two selectors.

---

## 7. Tests to Write

N/A - doc-only resolution. No new functions are introduced. Existing coverage of `getSession()` and `SessionUser` in the shared auth module is sufficient.

---

## 8. Out of Scope

- Polymer web-component lifecycle, Polymer data-binding, or fit-html rendering concerns from the Festify reference.
- Redux store shape, Redux middleware, or selector memoization via reselect.
- Firebase Auth SDK initialization, Firebase RTDB credential storage, or Firebase session persistence.
- The localStorage-based Spotify token mechanism used in Festify. CrowdTune does not use localStorage for OAuth tokens.
