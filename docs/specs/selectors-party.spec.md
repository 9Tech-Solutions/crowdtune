# Spec: Party Selectors

## 1. Purpose

This module provides derived-data functions (selectors) that sit between the raw party state and the UI for all party-level concerns. Its primary jobs are: determining whether the current user is the host of the active party, resolving the party identifier from the current routing context, identifying which player instance is the designated playback master, determining whether the current device is that playback master, and detecting whether another device holds the master role while the current device does not. Together these functions allow party-management UI and playback-coordination logic to answer permission and identity questions without duplicating party-object traversal logic across components.

---

## 2. Public Contract

### 2a. Host Identity Check

A function that reads both the active party record and the current authenticated user's identity and returns a boolean indicating whether the current user is the party's host.

- State observed: the current party record (specifically its "created by" field, which stores the identity of the user who opened the party); the currently authenticated user's identity token.
- Output: a boolean. True when the authenticated user's identity matches the "created by" field of the current party. False in all other cases: no authenticated user, no active party, or the identities do not match.
- No inputs beyond application state. No state mutated. Synchronous.

### 2b. Party Identifier Accessor

A function that reads the current URL routing parameters and returns the active party's short identifier.

- State observed: the routing parameters slice of application state (the parsed URL parameters, not the raw URL string).
- Output: the party identifier string when the route has loaded and the parameter is present, or null when the route has no party parameter (for example, when the user is on a non-party page).
- No state mutated. Synchronous.

### 2c. Playback Master Identifier Accessor

A function that reads the active party record and returns the identifier of whichever player instance is designated as the playback master for the party.

- State observed: the current party record's playback sub-object, specifically the master player instance field within it.
- Output: the master player instance identifier string when a party is loaded and a master has been designated, or null when the party is absent or no master is designated.
- No state mutated. Synchronous.

### 2d. Is-Playback-Master Derivation

A derived function (computed from the playback master identifier and the local player's instance identifier) that answers whether the current device or browser tab is the designated playback master for the party.

- State observed: the master player instance identifier (from 2c above) and the local player's own instance identifier from the player slice of application state.
- Output: a boolean. True when both identifiers are non-null and they are equal. False otherwise (no master designated, no local instance, or they differ).
- No state mutated. Synchronous.

### 2e. Has-Other-Playback-Master Derivation

A derived function that answers whether the party has a playback master and it is a different device than the current one.

- State observed: the master player instance identifier (from 2c) and the is-playback-master boolean (from 2d).
- Output: a boolean. True when a master identifier exists (non-null, non-empty) and the current device is not that master. False when there is no master at all, or when the current device is the master.
- No state mutated. Synchronous.

### 2f. Playback State Accessor

A function that reads the active party record and returns the full playback sub-object.

- State observed: the current party record's playback sub-object.
- Output: the playback state object when a party is loaded, or null when no party is present.
- No state mutated. Synchronous.

---

## 3. Behavior

### Host identity determination

To check whether the current user is the host: read the current party record from state. If no party record is present, the result is false. Read the authenticated user's identity from the auth provider. If no authenticated user is present, the result is false. Compare the user's identity string against the "created by" field stored on the party record. If they are equal, the result is true; otherwise false. The check uses a strict equality comparison; there is no role-table lookup or server round-trip.

### Party identifier resolution

To resolve the active party identifier: read the route parameter map from the router slice of state. If the parameter map is absent (the router has not yet parsed a route), return null. If the parameter map is present, return the value of the party identifier parameter from that map, which may itself be null if the current route does not include a party segment.

### Playback master resolution

To resolve the master instance identifier: read the current party from state. If absent, return null. Navigate to the playback sub-object within the party record. Return the master instance identifier field from that sub-object. If the party has no master designated (for example, a party that was just created and no client has taken the master role), the field will be null.

### Is-playback-master derivation

Compare the master instance identifier (from playback master resolution) against the current device's own player instance identifier (from the player slice of state). Both must be non-null and equal for the result to be true. If either is null or they differ, the result is false. This is a strict string equality comparison.

### Has-other-playback-master derivation

Combine the master instance identifier and the is-playback-master boolean. If the master instance identifier is non-null and non-empty, and the current device is not the master (is-playback-master is false), then another device holds the master role - return true. In all other cases (no master at all, or this device is the master), return false.

### Playback state access

Navigate from the current party record to its playback sub-object and return it whole. This is a straight field access with a null guard at the party level. No transformation of the playback data occurs here; consumers receive the raw playback sub-object.

---

## 4. Side Effects

This module contains no direct network calls, storage writes, audio output, or SDK interactions. All functions are pure transformations of data that has already been loaded into the application's state layer. The is-playback-master and has-other-playback-master derivations influence which UI controls are shown (play/pause buttons, device-selection prompts) but do not themselves trigger any action or side effect.

---

## 5. Edge Cases Worth Preserving

- No authenticated user: the host identity check returns false without attempting to read the party record. It never throws on a missing user.
- No active party: the host identity check, playback master accessor, and playback state accessor all return false or null respectively rather than throwing.
- Party present but no playback master designated: the playback master accessor returns null, is-playback-master returns false, and has-other-playback-master returns false. This is the correct state immediately after a party is created before any device claims the master role.
- Current device is the master: has-other-playback-master returns false, not true. The "other" qualifier is significant; a device should not report a foreign master when it itself is the master.
- Route is not a party route (user is on the home page or settings page): the party identifier accessor returns null, not an empty string. Callers must distinguish null (not on a party route) from an empty string (malformed route).
- Two devices with the same instance identifier: theoretically impossible if instance identifiers are generated per-session with sufficient entropy, but if it occurred, both would report is-playback-master as true simultaneously. The implementer should ensure instance identifiers are generated with UUID-level uniqueness.
- Master identifier exists but local instance identifier has not yet been set (player slice not yet initialised): is-playback-master returns false because the local identifier is null, which does not equal the master identifier. This is the correct transient state during page load.

---

## 6. Open Questions for the Implementer

1. **Host check: Firebase UID vs. JWT sub claim.** In the reference implementation the host identity check reads the authenticated user's identity from the Firebase Auth SDK at call time (a live SDK call, not a value stored in Redux state). In our stack the canonical user identity is the JWT `sub` claim, available from the Neon Auth session. The rule for our implementation is: a user is the host if and only if their JWT `sub` matches the `created_by` field stored on the Party record in Postgres. This is a simpler and more reliable check because the identity comes from the already-validated token rather than a live SDK call. No redesign ambiguity here - lock the rule as stated.

2. **No separate users-slice dependency.** The reference file does not import a users-slice for the host check; it reads the Firebase Auth SDK directly. In our stack, the JWT `sub` is available on the session object returned by the Neon Auth client. The party selectors file does not need to import from the users entity or any user-slice. The host check signature becomes: `isHost(party: Party, currentUserId: string | null) => boolean`.

3. **ConnectionState not referenced here.** None of the six functions in this module read or transform the three-state ConnectionState described in the state.ts spec. These selectors can be implemented independently of the WebSocket-vs-polling decision. No schedule-alignment constraint.

4. **Player instance identifier origin.** The is-playback-master derivation compares against the local player's instance identifier. In the reference implementation this is stored in a Redux player slice. In our stack, clarify where this per-tab identity lives: it should be a stable, per-session value generated once on page load (a UUID stored in a Zustand store slice or a React context value). The implementer must decide the source before wiring this selector, because it affects the function signature. Proposed signature: `isPlaybackMaster(party: Party, localInstanceId: string | null) => boolean`.

5. **Playback master field path.** The master identifier lives inside the party's playback sub-object. Confirm that the Party type in our entity layer includes a `playback` field with a `masterId` (or equivalent) sub-field, and that the Postgres schema has a corresponding column (or JSONB sub-document). If the playback state is stored as a separate Postgres row or a separate Realtime/WebSocket message rather than embedded in the party record, the accessor must be redesigned to read from a different source.

6. **Party identifier vs. short code.** The party identifier extracted from the route parameter in function 2b is used in two distinct ways in Festify: as a key to look up the Firebase RTDB node, and as a human-shareable "join code" guests type in. In our Postgres model these may be different values (an internal UUID primary key vs. a short alphanumeric code). Clarify whether the route parameter carries the UUID or the short code, and whether the same value is used for both the API call and the share URL. Lock this before implementing the router configuration.

7. **Tri-state / loading awareness for host check.** The host check returns a simple boolean (true or false), but during the page-load window before the party record arrives from the server, the function will return false (no party present). Components that gate host-only controls on this boolean will briefly show the guest view even to the host. The implementer should consider returning `undefined` (or a "loading" variant) when the party has not yet loaded, so the component can suppress the permission gate entirely rather than flashing the wrong state. This is a redesign decision - document the chosen approach in the component spec.

8. **Memoization.** None of the six functions in this module perform expensive computation; they are field accesses with at most one comparison. Memoization (via reselect in the reference) is present but provides negligible benefit here compared to the track selectors. In our stack, plain functions with no memoization are the right default. Flag for review only if profiling reveals the host check is called in a hot render loop.

---

## 7. Stack Mapping Notes

- This module maps to `apps/web/src/entities/party/lib/` in our FSD structure. All six functions are tightly coupled to the Party entity and should live in a single file, for example `apps/web/src/entities/party/lib/party-selectors.ts`, exported from the `@/entities/party` barrel.

- Each memoized selector in the reference becomes a plain function in our stack. The inputs that were implicitly injected from Redux state are explicit parameters in our signatures.

  - Host check: `(party: Party | null, currentUserId: string | null) => boolean`
  - Party identifier: not needed as a selector in our stack - TanStack Router's `useParams` hook provides this directly in components. However, if a non-component utility needs the party id, it accepts it as an explicit string parameter.
  - Playback master identifier: `(party: Party | null) => string | null`
  - Is-playback-master: `(party: Party | null, localInstanceId: string | null) => boolean`
  - Has-other-playback-master: `(party: Party | null, localInstanceId: string | null) => boolean` (can be derived by composing the two functions above)
  - Playback state accessor: `(party: Party | null) => PlaybackState | null`

- The Party type and PlaybackState type must be imported from `@/entities/party`. If PlaybackState is a sub-type embedded in the Party type definition, no separate import is needed.

- The is-playback-master and has-other-playback-master functions depend on the local player instance identifier. In the reference this came from a Redux player slice. In our stack the player instance store is not yet specced. Treat it as an opaque `string | null` parameter for now; the caller (likely a Zustand store or a context hook) supplies the value. This keeps the library functions pure and testable without a store.

- The party identifier accessor (function 2b) had access to router state via Redux in the reference. In our stack, TanStack Router is the routing layer. Components get the party id via `useParams({ from: '/party/$partyId' })`. Non-component callers receive the party id as an explicit parameter. There is no equivalent "read router state from outside a component" pattern in TanStack Router without accessing the router instance directly; the implementer should prefer the hook inside components and parameter threading outside.

- Depends on the Party entity type - defined in the entities layer under `@/entities/party`. Separate translation task if the Party type is not yet defined.

- Depends on the PlaybackState sub-type - embedded in or co-located with the Party entity. Note the relationship to ConnectionState (from state.ts spec): ConnectionState describes the Firebase/WebSocket connection quality, while PlaybackState describes the playback-coordination metadata (master id, currently playing, paused, etc.). They are distinct; this module touches PlaybackState, not ConnectionState.

- The playback selectors (2c, 2d, 2e, 2f) feed into the playback coordination feature. Cross-FSD import rule: if a feature (`@/features/playback-control`) calls these functions, it imports them from `@/entities/party`, which is a valid downward import. These functions must not import from any feature layer.

- Depends on the player-instance-id concept - a separate translation task. The player instance identifier store (whatever Zustand slice or context holds the local UUID) must be specced and implemented before the is-playback-master and has-other-playback-master functions can be fully wired in a component.
