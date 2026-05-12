# Spec: Route Selectors

## 1. Source Provenance

Translated from the Festify reference clone (LGPLv3) at `src/selectors/routes.ts`.
Translation date: 2026-05-12. No source code reproduced below.

---

## 2. Purpose and Scope

This module exposes five read-only derived values that turn the active party identifier into fully-formed navigation paths. Given a party identifier, any component or saga in Festify could call one of these functions to get the correct URL string for the queue view, the search sub-view (with an optional search query), the settings sub-view, the share sub-view, or the TV/kiosk view - without scattering URL-construction logic across the codebase.

The five conceptual selectors are:

- Queue route - the root party page URL.
- Search route - the party search sub-view URL, including an encoded query parameter.
- Settings route - the party settings sub-view URL.
- Share route - the party share sub-view URL.
- TV route - the separate TV/kiosk view URL for the party.

All five return null when no active party identifier is available.

---

## 3. Each Selector's Contract

### 3a. Queue Route

Derives the root URL for the active party's queue page.

- Input: the active party's short identifier string, drawn from application state.
- Output: a string of the form `/party/<shortId>`, or null when no party identifier is in state.
- No state mutated. Synchronous. Pure derivation.

### 3b. Search Route

Derives the URL for the party's search sub-view with a search query embedded.

- Input: the queue route (from 3a above), plus an arbitrary search query string supplied by the caller at call time.
- The query string is percent-encoded before being embedded in the URL.
- Output: a string of the form `/party/<shortId>/search?s=<encodedQuery>`, or null when no queue route is available.
- No state mutated. Synchronous. Pure derivation.

### 3c. Settings Route

Derives the URL for the party's settings sub-view.

- Input: the queue route (from 3a).
- Output: a string of the form `/party/<shortId>/settings`, or null when no queue route is available.
- No state mutated. Synchronous. Pure derivation.

### 3d. Share Route

Derives the URL for the party's share sub-view.

- Input: the queue route (from 3a).
- Output: a string of the form `/party/<shortId>/share`, or null when no queue route is available.
- No state mutated. Synchronous. Pure derivation.

### 3e. TV Route

Derives the URL for the separate TV/kiosk display view for the party.

- Input: the active party's short identifier string, drawn from application state.
- Output: a string of the form `/tv/<shortId>`, or null when no party identifier is in state.
- Note: this is deliberately NOT derived from the queue route. It uses the raw party identifier directly, because the TV view lives under a completely separate URL subtree (`/tv/` rather than `/party/`).
- No state mutated. Synchronous. Pure derivation.

---

## 4. Coverage Table

| Selector | Verdict | CrowdTune equivalent |
|---|---|---|
| Queue route (`/party/<id>`) | COVERED | TanStack Router `<Link to="/party/$partyId" params={{ partyId }}>` and `useNavigate` with `{ to: '/party/$partyId', params }`. The URL is constructed by the router from file-based route definitions; no separate string builder is needed. |
| Search route (`/party/<id>/search?s=<query>`) | COVERED | TanStack Router `useNavigate` to `/party/$partyId/search` with a `search` object `{ s: query }`. The router handles encoding. PartyTrackSearch component already owns this navigation. |
| Settings route (`/party/<id>/settings`) | COVERED | TanStack Router `useNavigate` or `<Link>` to `/party/$partyId/settings`. The `useSubView` hook in `PartyPage.tsx` drives active-tab display; no string construction needed. |
| Share route (`/party/<id>/share`) | COVERED | TanStack Router `useNavigate` or `<Link>` to `/party/$partyId/share`. Same as settings above. |
| TV route (`/tv/<id>`) | PARTIAL | TanStack Router can express this route, but a `/tv/$partyId` route file does not yet exist in `apps/web/src/routes/`. The URL shape is defined; the route page is a future work item. Navigation to this path can be constructed with `useNavigate` today, but the destination page is not yet implemented. |

---

## 5. Lock-Now Decisions

- Queue, search, settings, and share routes: lock to TanStack Router's built-in link and navigation primitives. No helper function is needed. Callers construct navigation targets inline using the router's typed `to` + `params` + `search` arguments.
- The search query string: lock to TanStack Router's `search` parameter object on the `/party/$partyId/search` route. The router serializes and encodes the object automatically; manual `encodeURIComponent` is not needed.
- TV route: lock to `/tv/$partyId` as the eventual route path when that page is implemented. Until then, any component that needs to surface a TV link can construct the href manually as a plain string `"/tv/" + partyId` inside a display-only anchor. This is acceptable because there is no router navigation logic to share - the link is informational only.
- No shared route-selector utility module is needed in CrowdTune. This is a doc-only resolution.

---

## 6. Open Questions

1. The TV/kiosk view (`/tv/$partyId`) does not exist yet as a route file. Should it be scoped to a future phase, or is it in scope for the current port? The spec for the TV view itself (if it exists in the Festify reference) should be translated separately.
2. The search sub-view uses a query parameter named `s` to carry the search string. Confirm that the existing `PartyTrackSearch` component and its route use exactly `?s=` as the query key, so the URL shape is consistent if anyone deep-links to a search state.
3. Festify derives the party identifier from Redux router params. In CrowdTune, `partyId` comes from `useParams({ from: '/party/$partyId' })`. Confirm that every component that previously consumed these route selectors now simply calls `useParams` or receives `partyId` as a prop - no central selector is needed.

---

## 7. Tests to Write

N/A - this is a doc-only resolution. All five selectors map to TanStack Router primitives that are tested by the router library itself. No new pure functions are introduced, so no new unit tests are required. If the TV route page is implemented in a future phase, route-rendering tests for `/tv/$partyId` should be added at that time.

---

## 8. Out of Scope

The following Festify concerns do not apply in CrowdTune and require no equivalent implementation:

- Redux route middleware or connected-react-router integration.
- Reselect memoization wrappers around URL strings (TanStack Router handles URL construction internally).
- Any redirect-after-login URL storage in the Redux store (Neon Auth handles post-auth redirection separately).
- Polymer custom elements or web-component routing patterns.
