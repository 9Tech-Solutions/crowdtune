# Spec: Domain Selector

## 1. Source Provenance

Translated from the Festify reference clone (`src/selectors/domain.ts`), which is licensed under LGPLv3.
This spec is a clean-room behavioral description only. No source code has been reproduced.
Translation date: 2026-05-12.

---

## 2. Purpose and Scope

Festify exposes a single selector that resolves the canonical public-facing host name of the running
application. Its purpose is to produce a stable, user-presentable string that share URLs, join-code
badges, and QR codes can be built on top of, regardless of whether the application is accessed via a
bare hostname or via a `www.`-prefixed variant.

The selector addresses one specific problem: the raw `window.location.host` value varies depending on
how the user arrived at the page (with or without a `www.` prefix, or via `localhost` during
development). Any UI that displays or embeds the service URL needs a single normalized form so that
all users see the same string in the join badge or share link.

---

## 3. Selector Contract

### 3a. Canonical Host Name Selector

A zero-argument, synchronous function that reads the browser's current location host and returns a
normalized host string.

- Input: none (reads browser environment directly).
- State observed: the host portion of the current page URL (hostname plus port when a non-standard
  port is present; no protocol, no path).
- Output: a plain string containing the normalized host name, governed by the following rules:
  - If the host contains `localhost` (development environment), return it unchanged.
  - If the host already starts with `www.`, return it unchanged.
  - Otherwise, prepend `www.` to the host and return that prefixed form.
- No state mutated. No network calls. No async behavior.

---

## 4. Coverage vs CrowdTune Equivalents

| Festify behavior | CrowdTune status | Notes |
|---|---|---|
| Normalize bare host to `www.` prefix for share-URL display | COVERED - doc only | PartyShare (commit `4309665`) already uses `window.location.origin` inline. That includes protocol + host; `www.` normalization is not applied and is not needed for the share-URL display case in our current implementation. |
| `localhost` pass-through for development | COVERED - inherently | `window.location.origin` on localhost returns `http://localhost:<port>` which is already correct for dev. No additional logic needed. |
| Single canonical origin for QR code data | COVERED - doc only | QR code generation (if any) should use the same `window.location.origin` call site pattern already established in PartyShare. |
| Build-time canonical origin override | PARTIAL | `window.location.origin` breaks in SSR or embedded contexts. CrowdTune currently has no SSR, so this is a future concern. An env var `VITE_PUBLIC_ORIGIN` should be considered (see Open Questions). |

Verdict: **doc-only**. No new function is required for current CrowdTune behavior. The one gap
(`VITE_PUBLIC_ORIGIN` for future SSR safety) is a forward-looking concern, not a blocking one.

---

## 5. Lock-Now Decisions

- The canonical origin for all current call sites is `window.location.origin`. This is already
  locked by the PartyShare implementation at commit `4309665`. Do not introduce a separate
  domain-selector utility unless SSR or embedded hosting becomes a real requirement.
- The `www.` normalization logic from Festify is not adopted. CrowdTune share URLs always use the
  full `window.location.origin` (protocol included), and `www.` prefixing is a Festify-specific
  vanity convention that does not apply to our domain strategy.
- If `VITE_PUBLIC_ORIGIN` is introduced in the future, it belongs in `shared/config/` as a
  re-exported constant (for example, `export const PUBLIC_ORIGIN`). All call sites that today
  reference `window.location.origin` directly should be migrated to read that constant instead.
  The constant falls back to `window.location.origin` when the env var is absent.

---

## 6. Open Questions

1. Should we add a `VITE_PUBLIC_ORIGIN` environment variable now, before any SSR need arises, so
   that call sites have a single place to override the canonical origin during deployment? Or is
   `window.location.origin` sufficient until SSR is on the roadmap?

2. Should the join-URL formatting (currently inline in PartyShare as
   `window.location.origin + "/" + party.shortId`) be extracted to a shared utility in
   `shared/lib/` so that QR codes, copy-to-clipboard, and any future deep-link feature all
   produce the same string from one place?

3. Festify normalizes to `www.` for production hosts. Does CrowdTune's production domain require
   or forbid a `www.` prefix? If the DNS record canonicalizes one form, should the app enforce
   it rather than relying on the browser URL?

---

## 7. Tests to Write

N/A - this translation is doc-only. No new implementation is introduced. If a `shared/lib/joinUrl`
utility is extracted in the future (see Open Question 2), its unit tests should cover:

- Correct assembly of protocol + host + party short ID.
- Behavior when `VITE_PUBLIC_ORIGIN` is set vs absent.
- Trailing-slash edge case (origin already ends with `/`).

---

## 8. Out of Scope

- Polymer custom element lifecycle and Redux store integration from Festify's original architecture.
- Firebase Remote Config or any server-driven domain override mechanism.
- The `www.` normalization rule as an adopted behavior - it is documented here for completeness but
  is explicitly not carried forward.
