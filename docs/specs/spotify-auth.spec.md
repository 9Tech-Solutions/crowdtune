# Behavioral Spec: Spotify OAuth and Token Management

Source module: `functions/lib/spotify-auth.ts` in the reference clone.
Translation target: Go Gin handlers in `apps/api/internal/handlers/spotify_auth.go` (and sub-packages).

---

## 1. Purpose

This module is the server-side broker between CrowdTune and Spotify's OAuth 2.0 system. It performs three distinct jobs. First, it converts a short-lived OAuth authorization code into an access token plus an encrypted refresh token, so that a party host can grant CrowdTune ongoing playback control without ever exposing their Spotify password. Second, it keeps that access alive by accepting an encrypted refresh token and returning a fresh access token whenever the old one expires. Third, it provides a client-credential (app-level, non-user) token so the application can query Spotify's catalog without requiring a signed-in user.

A fourth function handles the one-time account linkage step: it takes the host's freshly obtained Spotify access token, fetches the host's Spotify profile, and stitches the Spotify identity together with the platform identity - resolving any pre-existing account collisions along the way.

None of these handlers are visible to ordinary party guests. They are exclusively invoked during the host onboarding flow and during ongoing playback management.

---

## 2. Public Contract

### Handler A: Exchange Authorization Code for Tokens

**Purpose.** Converts a single-use Spotify OAuth authorization code into a short-lived access token and a durably encrypted refresh token. This is the first step after Spotify redirects the browser back to the application.

**Inputs (request body):**
- Authorization code (string, required): the one-time code Spotify placed in the redirect URL.
- Redirect URI (string, required): must exactly match the redirect URI that was sent to Spotify during the authorization request. Spotify validates this server-side. Any mismatch causes Spotify to reject the exchange.

**Caller context:** this handler must be called by an authenticated application user (the host). In our stack the bearer JWT is validated by the Gin auth middleware before the handler runs.

**Outputs (response body):**
- Access token (string): the Spotify OAuth access token, valid for approximately one hour. Returned in plaintext; the client uses it immediately for API calls.
- Expiry duration (integer, seconds): how long until the access token expires.
- Encrypted refresh token (string): the Spotify refresh token, encrypted with an application-layer symmetric key before leaving the server. The client must store this value and return it verbatim on subsequent refresh calls. It is never stored in the database in Festify's design (see Open Questions).
- Token type (string): always "Bearer"; passed through from Spotify for completeness.

**State observed:** the Spotify client ID and client secret from environment configuration. The encryption key from environment configuration.

**State mutated:** none in the database at this step (see Open Questions about whether our stack should persist the encrypted token here).

---

### Handler B: Refresh an Access Token

**Purpose.** Accepts an encrypted refresh token (previously returned by Handler A), decrypts it, exchanges it with Spotify for a new access token, and returns the new access token to the caller. The refresh token itself is not rotated by Spotify in this flow - the same encrypted refresh token remains valid.

**Inputs (request body):**
- Encrypted refresh token (string, required): the opaque blob returned by Handler A (or stored by the client from a prior refresh cycle).

**Caller context:** authenticated host (bearer JWT in header).

**Outputs (response body):**
- New access token (string): fresh Spotify access token.
- Expiry duration (integer, seconds): validity window.

**State observed:** the encryption key (to decrypt the inbound token). The Spotify client ID and secret (for the exchange request).

**State mutated:** none.

**Error behavior:** if Spotify returns a non-success status (expired refresh token, revoked authorization, network failure), the handler returns a generic server error. The caller should interpret this as a signal to re-initiate the full OAuth flow with the host.

---

### Handler C: Get Client Credentials Token

**Purpose.** Obtains a non-user-scoped Spotify access token using the application's own client credentials. This token can query Spotify's catalog (search, album lookup, track metadata) but cannot control playback or access user-specific data.

**Inputs:** none (no request body fields required). The handler is still mounted under the auth group so the caller must be authenticated, but the Spotify exchange itself uses only the application's client ID and secret.

**Outputs (response body):**
- Access token (string): the client-credential access token.
- Expiry duration (integer, seconds).

**State observed:** Spotify client ID and secret from environment.

**State mutated:** none.

**Error behavior:** if Spotify's token endpoint returns an error, the handler surfaces a server error to the caller. The original Spotify status code is logged (not forwarded to avoid leaking internal detail).

---

### Handler D: Link Spotify Identity to Platform Account

**Purpose.** After the host has granted authorization and the SPA has obtained a fresh Spotify access token, this handler resolves which platform user identity the Spotify account should be bound to. It fetches the host's Spotify profile, checks whether a platform account already exists for that email, and performs one of three actions: reuse an already-linked account, link the Spotify identity to the existing unlinked account (if the caller owns it), or create a brand-new platform account. In Festify's design this also migrates any votes or party associations that were attached to the caller's prior anonymous session into the new Spotify-linked account.

**Inputs (request body):**
- Spotify access token (string, required): a valid user-scoped Spotify access token obtained by the client from Handler A's response. The handler uses it to call Spotify's "current user profile" endpoint on the caller's behalf.

**Caller context:** authenticated platform user (bearer JWT). The caller's platform user ID is the anchor for the migration and account-linking logic.

**Outputs (response body):**
- In Festify: a Firebase custom sign-in token scoped to the resolved (possibly newly created) account. In our stack this would instead be a success acknowledgment, since Neon Auth manages identity and a new JWT is not needed - see Open Questions.

**State observed:**
- The platform user record for the caller (to detect whether they signed in anonymously or with a real provider).
- Any existing platform user record matching the email returned by Spotify (to detect collisions).
- The Spotify-ID-to-user mapping (to detect whether the email belongs to a Spotify-linked account vs. a plain email account).
- Votes and party associations attached to the old user ID (for migration when the caller was anonymous).

**State mutated:**
- The resolved platform user's profile metadata is updated: display name, photo URL, email, Spotify identity claim.
- Votes previously attributed to the caller's anonymous user ID are re-attributed to the new/linked user ID.
- Party membership records for the old anonymous ID are deleted and the old user record is removed.

**Collision rules (three branches):**
1. A platform account exists for that email AND it is already linked to the same Spotify ID: the accounts are already consistent. Return the existing account identity. No data changes.
2. A platform account exists for that email AND it is linked to a DIFFERENT Spotify ID: this is a conflict. Reject with a permission-denied error. No state changes.
3. A platform account exists for that email but has no Spotify link AND the caller IS that account holder: link the Spotify ID to the existing account. No new account is created and no data migration is needed.
4. No platform account exists for that email: create a new account, link the Spotify ID, and migrate any data from the caller's prior anonymous session into the new account, then delete the old anonymous account.

**Error cases:**
- Spotify profile has no email: reject with an invalid-argument error (Spotify accounts without verified emails cannot be used as host identities).
- Spotify profile returns an invalid display name or email: propagate a validation error to the caller.
- The migration or account-update steps fail in the database: surface a server error.

---

## 3. Behavior

### OAuth Code Exchange (Handler A)

The caller provides the authorization code and the redirect URI. The handler validates that both fields are present. It then calls Spotify's OAuth token endpoint using HTTP POST with form-encoded parameters, authenticating with Basic credentials (the application client ID and secret, base64-encoded). On success it receives a JSON response containing the access token, token type, expiry duration, and refresh token. Before returning the refresh token to the caller, it encrypts it using application-layer symmetric encryption with a key loaded from the environment. The encrypted refresh token and the plaintext access token are returned together.

### Token Refresh (Handler B)

The caller provides the encrypted refresh token they stored from a prior exchange. The handler decrypts it locally, then calls Spotify's OAuth token endpoint with the decrypted value and the "refresh_token" grant type, again using Basic auth. Spotify returns a new access token (and optionally a new refresh token, though Festify's implementation does not handle token rotation - see Open Questions). The handler returns the new access token and its expiry.

### Client Credentials (Handler C)

The handler calls Spotify's OAuth token endpoint with the "client_credentials" grant type. No user token is involved. On success it returns the resulting access token and its expiry window.

### Account Linking (Handler D)

The handler first calls Spotify's user profile endpoint using the Bearer access token provided by the caller. If the profile has no email, it rejects immediately. It then checks the platform's user store for an existing account with that email. Depending on what it finds (see collision rules in section 2), it either returns the existing account's identity token, links the Spotify ID to the existing account, or creates a new account. If a new account is created and the calling user was previously anonymous (no sign-in provider), it migrates all votes and party associations from the old anonymous ID to the new account in a single atomic batch write, then deletes the old user record.

---

## 4. Side Effects

**Spotify token endpoint calls** (Handlers A, B, C): HTTP POST to Spotify's OAuth token endpoint with form-encoded parameters and Basic authentication. The payload is grant type plus one of: authorization code with redirect URI, encrypted-then-decrypted refresh token, or nothing (client credentials). The response is JSON containing access token, expiry, and (for Handler A) a refresh token.

**Spotify user profile call** (Handler D): HTTP GET to Spotify's current-user-profile endpoint with a Bearer authorization header carrying the access token the client obtained. Returns the host's email, display name, Spotify user ID, and profile image URLs.

**Platform user store writes** (Handler D): create, update, and delete operations on platform user records. These are done as a batch (atomic multi-path update in Festify's Firebase RTDB; in our stack this is a Postgres transaction).

**Encryption** (Handler A): the Spotify refresh token is encrypted with a symmetric key before leaving the server. The encrypted value is included in the response body and is expected to be held by the client for future use.

**Decryption** (Handler B): the encrypted refresh token from the client is decrypted in memory before being forwarded to Spotify. The plaintext value never appears in logs.

**Logging**: Festify logs error objects (including Spotify status codes) to the console on failure paths. In our stack, replace with structured `slog` calls. Log only the HTTP status code and a generic message, not the token values.

---

## 5. Edge Cases Worth Preserving

**Missing required fields**: Handlers A and B must validate that the authorization code / redirect URI / encrypted refresh token is present before making any outbound call. Return a 400-equivalent error immediately if missing.

**Spotify email absent**: Handler D must reject a Spotify profile that carries no email. A Spotify account without an email cannot be uniquely and stably identified across sessions.

**Account collision (different Spotify ID)**: if a platform account with the same email is already linked to a different Spotify ID, the handler must refuse the link and not proceed. This is a security invariant: one email must not silently reassign its Spotify association.

**Caller owns the existing account**: if a platform user who signed in with email/password (not Spotify) later initiates Spotify linking, and their email matches what Spotify returns, the handler confirms they are the same person by checking that the caller's platform ID matches the existing record's ID. Only then does it link the Spotify identity to the existing account. It does not allow a third party to hijack an existing account via Spotify.

**Anonymous session migration**: if the caller was previously an anonymous session (no provider associated), any votes or party associations they accumulated should be migrated to the new or linked account atomically. If the migration fails, the new account creation should be rolled back or at minimum the failure surfaced rather than silently leaving orphan data.

**Spotify profile image URL validation**: before persisting a photo URL from Spotify's profile response, validate that it is a well-formed URL. Festify uses a URL-validation helper before accepting the image. This prevents storing malformed or potentially dangerous values as display metadata.

**Network failures / Spotify unavailability**: the reference implementation uses a retry-capable HTTP client for all Spotify calls. In our stack, decide whether to use `net/http` with manual retry logic or a retry-capable HTTP client. At minimum Handler B (refresh) should retry once on transient network errors before returning failure, since a failed refresh may cause playback interruption.

**Expired refresh token**: when Spotify rejects a refresh token as invalid or expired (the host has revoked authorization or it has been too long since use), the server cannot recover automatically. The handler should return a clear error so the client knows to initiate the full OAuth flow again.

**Rate limiting**: if Spotify returns a 429 Too Many Requests, Festify's current implementation does not handle it distinctly - it surfaces a generic error. See Open Questions.

---

## 6. Open Questions for the Implementer

**Refresh token storage model (critical design decision)**: In Festify, the encrypted refresh token is returned to the client and stored client-side (in the browser). The server never persists it. In our stack the roadmap implies the `parties` table holds a `spotify_refresh_token_encrypted` column, which means the server stores it. These are architecturally different. Determine which model we adopt before writing the handler:

- Client-side storage: the client sends the encrypted refresh token with every refresh request. Simpler, but the refresh token can be lost if the client clears storage, and it cannot be invalidated server-side without a separate revocation table.
- Server-side storage: the server looks up the encrypted token by the host's user ID (or party ID). The client sends no token on refresh - just their JWT. More robust, easier to revoke, consistent with the roadmap. Recommended for our stack.

Flag: if server-side storage is adopted, Handler A should store the encrypted refresh token in the database immediately after the exchange, not return it to the client. Handler B should look it up by user/party ID rather than accepting it from the request body.

**Token scoped per-user or per-party (schema decision)**: Confirm whether `spotify_credentials` is one row per host user (one-to-one with the user's identity) or one row per party (one-to-many if a user can host multiple parties simultaneously). The roadmap leans toward per-party. This affects the foreign key on the credentials table and the lookup in Handler B.

**OAuth callback handled by the SPA or the API (flow design decision)**: Festify's `exchangeCode` is called by the SPA after Spotify redirects to the frontend, meaning the SPA receives the code and posts it to the server. This is the "authorization code" flow without PKCE, relying on the server-side secret for token exchange. In our stack, decide whether to:

1. Keep the same client-initiates-exchange pattern (SPA receives the code in the redirect, POSTs it to the API). Simpler frontend integration, but the redirect URI must be the SPA's URL and the code travels from browser to API over HTTPS.
2. Use a server-side callback: Spotify redirects to an API endpoint that completes the exchange and then redirects the browser. The code never touches the frontend. More secure (code is never in JavaScript memory), but requires a dedicated callback handler that issues a temporary state cookie.

Recommendation: adopt option 2 (server-side callback) with a CSRF state nonce. The PKCE extension is recommended for completeness even when a client secret is present. Flag for security review before implementation.

**CSRF state nonce**: Festify's source does not show explicit state parameter generation or validation in this file. In our stack, Handler A's flow must generate a random nonce, store it server-side (or in a short-lived signed cookie), include it in the Spotify authorization redirect URL, and validate it when Spotify redirects back. Without this, the OAuth flow is vulnerable to CSRF. Flag for security review.

**Token rotation on refresh**: Spotify may return a new refresh token alongside a new access token in the refresh response. Festify's implementation does not capture or store this new refresh token if it is returned. In our stack, if we are storing tokens server-side, the handler should check whether Spotify returned a new refresh token and, if so, re-encrypt and update the stored value. Not doing this can cause the stored refresh token to become invalid over time.

**Re-encryption on each refresh write**: if server-side storage is adopted, decide whether to generate a fresh AES-GCM nonce (and therefore a different ciphertext) on every write. AES-GCM with a random nonce gives probabilistic uniqueness per write, which is sufficient. Re-encryption on every refresh write is acceptable and avoids the risk of nonce reuse.

**Account linking model in our stack (Handler D)**: Festify's Handler D is deeply coupled to Firebase Auth's custom-claims system and its anonymous user concept. Our stack uses Neon Auth (Better Auth) and there is no anonymous user record - unauthenticated guests do not have a user row. This means:

- The vote-migration sub-routine (moving votes from an old anonymous UID to the new Spotify-linked UID) may not apply in the same form if guests never get a row in `neon_auth."user"`. Confirm whether we track guest votes by an anonymous session token or simply do not persist them until a user is authenticated.
- If guest votes are tracked by a session token (not a user ID), the migration step should reassign them by session token rather than by Firebase UID.
- The "link Spotify to existing platform account" step is replaced by Neon Auth's account-linking mechanism. Evaluate whether Better Auth handles Spotify as an OAuth provider natively (it supports OAuth 2.0 providers), in which case Handler D may be partially or fully replaced by Better Auth's own linking flow. Flag for architect review before implementing Handler D.

**Logging discipline**: all token values (access tokens, refresh tokens, client secrets, encryption keys) must never appear in logs. Log only boolean presence indicators (token_set: true/false) and generic error codes. This is already established project discipline; confirm the handler's structured slog calls follow this pattern before merge.

**Rate limit handling**: define a policy for Spotify 429 responses. Options: return 429 directly to the client with a Retry-After header, implement exponential back-off with a maximum of one retry in the handler, or return a service-unavailable error and let the client retry. Recommend returning 429 with the Retry-After value forwarded from Spotify so the client can back off intelligently.

**`last_refreshed_at` timestamp**: add a `last_refreshed_at` column to the credentials table for observability and to help detect stale credentials (e.g., refresh tokens that have not been used in months may have been silently revoked). This column should be updated on every successful Handler B call.

**HTTP client for Spotify calls**: choose between Go's `net/http` (simple, no retries built in) and a retry-capable client such as `github.com/go-resty/resty/v2`. Festify used `requestretry` with retry semantics. At minimum, wrap the Spotify exchange call in a retry with a maximum of two attempts and exponential back-off for 5xx and network-error responses. Flag for implementer to decide.

**Connection pooling**: Festify uses a persistent keep-alive HTTPS agent shared across all Spotify calls. Go's `net/http` `http.Client` with a shared `Transport` achieves the same effect. Use a package-level `http.Client` with `MaxIdleConnsPerHost` set appropriately (suggest 10).

---

## 7. Stack Mapping Notes

**Each exported function -> one Gin handler.** Mount all four under the `/api` group so the bearer JWT middleware applies. Suggested routes:

- Handler A (exchange code): `POST /api/spotify/token`
- Handler B (refresh): `POST /api/spotify/refresh`
- Handler C (client credentials): `GET /api/spotify/client-token`
- Handler D (link accounts): `POST /api/spotify/link`

All four require the `bearerAuth` security scheme in `openapi.yaml`. Add entries for each new endpoint before code-generating the server stubs with `oapi-codegen`.

**Spotify HTTP calls -> Go `net/http`.** Use a package-level `*http.Client` with a shared transport for connection reuse. Basic auth is a base64-encoded `client_id:client_secret` string set in the `Authorization` header. This value can be computed once at startup from the environment variables and reused.

**Application-layer encryption -> `apps/api/internal/crypto/` package.** Create a small internal package with two exported functions: one that takes plaintext and a key and returns an AES-GCM encrypted, base64-encoded string, and one that reverses the operation. Key sourced from the `SPOTIFY_TOKEN_ENC_KEY` environment variable (32 bytes for AES-256). This is a separate translation task; the handler imports it.

**Environment variables required (new, not yet in the project):**
- `SPOTIFY_CLIENT_ID` - Spotify application client ID
- `SPOTIFY_CLIENT_SECRET` - Spotify application client secret
- `SPOTIFY_TOKEN_ENC_KEY` - 32-byte hex or base64 string for AES-256-GCM encryption
- `SPOTIFY_REDIRECT_URI` - the OAuth callback URI registered with Spotify

These should be added to `.env.example` (with placeholder values) and validated at API startup via a presence check (log `key_set: true` not the value).

**Persistent state -> new `spotify_credentials` table.** This table does NOT exist yet. The implementer MUST run `goose create spotify_credentials sql` to author the migration BEFORE writing the handler, since sqlc generates query helpers from the live schema. Suggested columns: `id` (uuid), `user_id` (text, FK referencing `neon_auth."user"(id)`), `party_id` (uuid, FK referencing `parties(id)`, if the per-party model is adopted), `access_token` (text, plaintext - short-lived, stored as a cache), `access_token_expires_at` (timestamptz), `refresh_token_encrypted` (text, AES-GCM ciphertext), `scopes` (text, space-delimited scope string from Spotify), `last_refreshed_at` (timestamptz), `created_at` (timestamptz), `updated_at` (timestamptz).

**User identity -> JWT `sub` claim.** Use `auth.UserID(c)` from the Gin context in every handler that touches user-specific credentials. Never duplicate user records; the FK points to `neon_auth."user"(id)` (quoted, because `user` is a reserved word in Postgres).

**Account linking (Handler D) -> partially replaced by Neon Auth / Better Auth.** If Better Auth supports Spotify as an OAuth 2.0 provider natively, the provider-linking logic in Handler D may be unnecessary. Evaluate before implementing. At minimum, the vote-migration sub-routine is a separate concern that belongs in a party or vote service, not in the Spotify auth handler.

**`../spotify.config` module** - this is the configuration module for Spotify client ID, client secret, and encryption secret. In our stack these come from environment variables read at startup, not from a separate module. This is a resolved dependency; no separate translation task needed.

**`./utils` module (specifically the `crypto` helper and `isValidUrl` helper)** - the symmetric encrypt/decrypt functions live here in Festify. In our stack this maps to the `apps/api/internal/crypto/` package described above. The `isValidUrl` helper maps to a simple URL parse-and-validate call in Go's `net/url` package. No separate translation task needed for the URL validator.

**`requestretry` library** - Festify's HTTP client with automatic retry. In our stack, implement retry manually in a small helper or adopt `resty/v2`. Flag for implementer to decide before writing the handler.

**OpenAPI schema additions needed:**
- Request body schema for `POST /api/spotify/token`: fields for authorization code and redirect URI.
- Response schema for `POST /api/spotify/token`: access token, expiry, encrypted refresh token, token type.
- Request body schema for `POST /api/spotify/refresh`: encrypted refresh token (or empty if server-side storage is adopted).
- Response schema for `POST /api/spotify/refresh`: access token, expiry.
- Response schema for `GET /api/spotify/client-token`: access token, expiry.
- Request body schema for `POST /api/spotify/link`: Spotify access token.
- Response schema for `POST /api/spotify/link`: success acknowledgment (or user identity if re-login is needed).

Run `oapi-codegen` and `openapi-typescript` after finalizing the schema to regenerate server stubs and frontend types before writing handler or client code.

**Security review required**: all four handlers touch OAuth credentials, encryption, and user identity mutation. Run `/security-review` before merging. Pay particular attention to Handler D (account linking) and the CSRF state nonce gap noted in section 6.
