# Behavioral Specification: Application Domain State

Source file translated: `state.ts` (Festify reference)
Translation date: 2026-05-11
Status: Foundation spec - all subsequent component specs depend on the domain entities described here.
Implementer scope: **types and value-object shapes only**. No JSX, no Zustand stores, no API hooks, no Vitest behavior tests. The HeroUI-first rule (`react-component-author` rules 4 + 5) does NOT apply to this spec because there is no visual surface to render. The first UI port that triggers HeroUI MCP lookups will be a separate spec (e.g. `queue-list.spec.md`).

---

## 1. Purpose

This file defines the complete vocabulary of domain entities and view-layer state shapes used throughout the application. It is the single source of truth for what a "party", a "track", a "vote", a "user", and a "playback session" mean to every other component. Any piece of code that creates, reads, or transforms application data does so in terms of these shapes. Getting these shapes right is critical because they propagate into database schemas, API contracts, and every UI component.

---

## 2. Public Contract

### Domain Entities

These are the core business objects that are persisted and synchronized across clients.

#### Party

A party represents a live music session that guests join to collectively control what plays next.

- A stable short alphanumeric code that humans type to join the session (required, server-assigned, unique). This is the human-facing join code, not a database primary key.
- A display name chosen by the host (required, non-empty string).
- The ISO 3166-1 alpha-2 country code where the party is hosted (required, string). Used to enforce regional content restrictions.
- A timestamp marking when the party was created (required, unix epoch milliseconds, server-authoritative).
- The identifier of the user who created the party (required, opaque string referencing the auth user record, server-authoritative).
- An embedded playback state object (required, see Playback below).
- An optional settings object (see PartySettings below). When absent, defaults apply.

#### PartySettings

Configuration knobs that the host can adjust.

- A boolean flag controlling whether anonymous (unauthenticated) users are permitted to vote. Defaults to true. When false, guests must sign in before voting.
- A boolean flag controlling whether tracks marked as containing explicit content can be added via search. Defaults to true. This restriction applies only to search-driven additions; fallback playlist tracks bypass it intentionally.
- A boolean flag controlling whether a guest can add multiple tracks in one search session. When true, the search panel stays open after each vote. When false, the panel closes after the first vote. Defaults to true.
- A free-text string displayed beneath the playback progress bar when the party is shown on a television or large-display mode. Defaults to a short call-to-action message referencing the service domain.
- An optional maximum track length expressed in whole minutes (nullable). When set to a positive integer, tracks longer than this limit cannot be added via search. Null means no limit is enforced.

#### Track

A single song entry in the party queue.

- A reference object identifying the track in its streaming provider (required, see TrackReference below).
- A timestamp marking when this track was added to the queue (required, unix epoch milliseconds, server-authoritative).
- A boolean flag indicating whether this track came from the host's fallback playlist rather than a guest vote (required). Fallback tracks fill the queue when no guest votes are pending.
- A non-negative integer representing the net number of upvotes this track has received (required). Determines queue ordering.
- A non-negative number representing the track's position in the sorted queue (required). Distinct from vote count: two tracks with equal votes can still be ordered deterministically.
- An optional timestamp marking when this track was last played (unix epoch milliseconds). Absent until the track has been played at least once.

#### TrackReference

A pointer to a specific song in a specific streaming provider.

- An opaque string identifier assigned by the streaming provider (required). In the current implementation the only supported provider is Spotify, so this is a Spotify track ID.
- The name of the streaming provider as a string (required). Currently always the value "spotify".

#### Metadata

The display information about a track fetched from the streaming provider. Stored separately from the queue entry and keyed by the same provider track ID.

- A list of artist display names (required, at least one element, ordered as returned by the provider).
- A list of image objects representing album artwork (required, may be empty if the provider returns none). Each image has a URL string, a pixel width integer, and a pixel height integer.
- The total playback duration in milliseconds as a non-negative integer (required).
- A boolean flag indicating whether the track is playable in the party's country (required). Non-playable tracks should be hidden or greyed out in the UI.
- An optional list of background image URLs for ambient display (absent when not provided by the provider).
- An optional ISRC (International Standard Recording Code) string for deduplication or royalty tracking purposes.
- The track title as a display string (required).

#### Image

A single image asset with dimensions.

- The URL of the image resource (required, string).
- The pixel width as a positive integer (required).
- The pixel height as a positive integer (required).

#### Playback

The live playback state of a party, embedded inside the Party entity. This object is written by the backend and read by all clients.

- A timestamp of the last time playback state changed (unix epoch milliseconds, server-authoritative). Clients use this combined with the last known position to compute the current real-time position without polling.
- The playback position in milliseconds at the time of the last state change (non-negative integer). Not the current live position - clients must compute current position by adding elapsed wall-clock time when the party is playing.
- The opaque device or client identifier of the "master" player that controls actual audio output (nullable string). Null means no master player is currently active.
- A boolean indicating whether audio is currently playing (required, server-authoritative).
- An optional boolean representing a desired future playing state requested by the host but not yet confirmed by the player (nullable). Null means no pending change.

#### Playlist

A Spotify playlist that the host can designate as a fallback source to fill dead air.

- The human-readable display name of the playlist (required, string).
- A reference object (PlaylistReference) pointing to the playlist in the streaming provider (required).
- The total number of tracks in the playlist (required, non-negative integer).

#### PlaylistReference

Extends TrackReference with ownership information.

- Inherits the provider-assigned opaque string ID and the provider name from TrackReference.
- The user ID of the Spotify user who owns this playlist (required, string).

---

### Connection State

An enumerated value with three possible states: Unknown (state not yet determined, initial condition), Connected (the real-time data link to the backend is established), or Disconnected (the link was lost or could not be established).

---

### View-Layer State Shapes

These are transient UI states that do not need to be persisted across sessions but must be available synchronously to components.

#### App Shell State

- The text content of the currently displayed toast notification (nullable string). Null means no toast is visible.

#### Home View State

State held while the user is on the landing page where they create or join a party.

- A boolean flag indicating a party creation request is in flight.
- An error object from the most recent failed party creation attempt (nullable).
- A boolean flag indicating a party join request is in flight.
- An error object from the most recent failed party join attempt (nullable).
- The string the user has typed into the join code input field.
- A boolean indicating whether the typed join code passes basic format validation.

#### Party State

State held while the user is inside an active party session.

- The current connection state (one of the three ConnectionState values described above).
- The current Party entity (nullable; null while loading or if load failed).
- A boolean indicating whether the queue's track list has been fully loaded from the backend.
- An error object from the most recent failed party load attempt (nullable).
- A boolean indicating a party load request is in flight.
- A map from track provider ID strings to Track objects representing all tracks currently in the queue (nullable; null until the first load completes).
- A map from track provider ID strings to booleans recording which tracks the current user has voted for in this session (nullable; null until user vote state loads).

#### Party View State

Transient UI state for the main party screen while inside a session.

- A boolean indicating whether the sign-in modal is currently displayed.
- A boolean indicating a track search request is in flight.
- An error object from the most recent failed search (nullable).
- A map from track provider ID strings to Track objects representing the current search results (nullable; null when no search has been performed or results were cleared).
- A boolean indicating whether the user account menu is currently open.

#### Player State

State relating to the Spotify Web Playback SDK instance running in this browser tab.

- The opaque local device identifier assigned by Spotify to this browser tab's player instance (nullable string; null until the SDK initializes).
- A stable identifier for this particular player instance within the session (non-empty string, generated at startup).
- A boolean indicating the SDK is currently initializing.
- An error object from the most recent SDK initialization failure (nullable).
- A boolean indicating whether this browser/device is compatible with the Spotify Web Playback SDK.
- A boolean indicating the Spotify SDK script has loaded and is ready for use.
- A boolean indicating a play/pause toggle request is currently in flight.
- An error object from the most recent failed play/pause toggle (nullable).

#### Settings View State

State for the host's party settings and playlist configuration screen.

- A boolean indicating a playlist search or load request is in flight.
- An error object from the most recent failed playlist load (nullable).
- The text the host has typed into the playlist search input.
- A boolean indicating a queue flush (clearing all queued tracks) is in flight.
- An error object from the most recent failed queue flush (nullable).
- A boolean indicating that tracks are being loaded from a fallback playlist into the queue.
- An error object from the most recent failed track load from playlist (nullable).
- The total number of tracks to be loaded from the playlist (non-negative integer, used to show progress).
- The number of tracks successfully loaded so far in the current playlist-load operation (non-negative integer).

#### Auth Provider Status

A generic container describing the authorization state for one authentication provider.

- A boolean indicating an authorization handshake with this provider is in progress.
- An error object from the most recent authorization failure for this provider (nullable).
- A boolean indicating the authorization status for this provider has been determined (false means the status is still being resolved after page load).
- The authenticated user object returned by this provider (nullable; null if not signed in with this provider).

#### User Credentials

The collection of all auth provider statuses for the current user. Tracks one Auth Provider Status for each of the following providers: Facebook, GitHub, Google, Twitter, the internal Firebase session, and Spotify. The Spotify entry carries a richer user profile object (including Spotify-specific profile fields) rather than the generic auth user shape.

#### Enabled Providers List

A map from provider name to a boolean flag, indicating which OAuth providers are available for the user to sign in with at a given moment. Includes entries for Facebook, GitHub, Google, Twitter, and Spotify.

#### User State

Top-level state for the currently authenticated user.

- The full user credentials map (required, always present, individual entries may show "status unknown" until resolved).
- A nullable Enabled Providers List. When non-null, this represents a restricted set of providers the user must choose among to complete a re-authentication or account-linking flow. Null under normal operation.
- A list of Playlist objects the user has retrieved from Spotify (required, empty list when none loaded).

#### Root Application State

The single top-level state container combining all slices above, plus a router location object (from a separate routing module) and the metadata map (a record from track provider ID strings to Metadata objects).

---

## 3. Behavior

The entities in this file are purely declarative type definitions; they have no runtime behavior of their own. However, several behavioral contracts are implied by the shapes:

Default party settings are computed when a new party is created and no host overrides are provided. All boolean permission flags default to their most permissive values (all allowed). The maximum track length defaults to null (no limit). The TV mode display text defaults to a short invite message. Hosts may override any field individually; any field not overridden takes its default.

The enabled providers list is computed from a subset of provider names. Starting from a fully-disabled map, individual providers are switched on by name. This computed value is used in the re-authentication flow to constrain which login buttons appear.

Connection state begins as Unknown on page load. The real-time data layer transitions it to Connected when a subscription is established and to Disconnected when the connection drops. Components watching this state should handle all three values visually.

The playback position reported in the Playback object is a "last known" snapshot, not a continuously updated counter. Clients compute the live position by reading the last position and the change timestamp together, then adding the elapsed wall-clock time if the playing flag is true.

The optional target playing flag captures host intent that has not yet been confirmed. When this is non-null, the UI should show a pending/transitioning state rather than the final state.

---

## 4. Side Effects

This file defines data shapes only. No network calls, storage writes, audio output, or SDK interactions are initiated by the type definitions themselves. Side effects that populate these shapes are defined in action and saga modules (separate translation tasks).

---

## 5. Edge Cases Worth Preserving

- Party settings being absent (not yet written to the backend) must not crash the UI. The consumer should treat absent settings as if defaults were present, without modifying the backend record.
- The tracks map being null is distinct from being an empty object. Null means the data has never loaded; an empty object means the queue genuinely has no tracks. UI must handle both states separately.
- The user votes map being null is similarly distinct from an empty map. Null means vote state has not been fetched yet for the session; empty means the user has voted for no tracks.
- Search results being null is distinct from an empty results map. Null means no search has been issued; empty means the search returned zero matches.
- The player instance ID is permanent for the lifetime of the tab. It is not the same as the local Spotify device ID; the local device ID arrives later during SDK initialization and may never arrive if the device is incompatible.
- The "status known" flag on an auth provider exists because on page load the app does not yet know whether the user is signed in with any provider. Components must wait for this flag before showing auth-dependent UI.
- The "needs follow-up sign-in with providers" field in user state being non-null signals a special mid-flow state (typically after an email-conflict or account-linking challenge). When non-null, the UI should restrict login options to only the providers in the list and explain the context to the user.
- The fallback flag on a track determines whether explicit-content filtering applies. Host playlist tracks bypass the explicit content check even when the party setting disallows explicit search results.

---

## 6. Open Questions for the Implementer

### Identity and IDs

The party is identified by a human-readable short code ("short_id" in the reference). This is not a UUID. In our stack, the Postgres row should have a UUID primary key for relational integrity, but the application-layer identifier exposed to users and used in URL paths should remain a short alphanumeric code (for example, 6-8 uppercase characters). The implementer must decide where short codes are generated (API layer on party creation) and ensure uniqueness via a database unique constraint plus retry on collision.

Track identities in the queue use the streaming provider's own ID strings as map keys. In Postgres this translates to a natural key column (provider name + provider track ID) rather than a surrogate UUID. Flag for the schema designer: decide whether a surrogate key is also needed for FK references.

### Timestamps

All timestamps in the reference are stored as unix epoch milliseconds (plain integers). In Postgres, all timestamps should be "timestamptz" columns, stored and retrieved in UTC. On the API wire (OpenAPI), they should be ISO 8601 date-time strings, not integer milliseconds. The frontend should parse ISO strings into Date objects or millisecond numbers as needed. The "last change" timestamp in Playback is the most latency-sensitive field and must round-trip without loss.

### Server vs. Client Authority

The following fields are server-authoritative and must never be set by client input; the API must reject or ignore any client-supplied value:
- Party created-at timestamp
- Party created-by user identifier
- Track added-at timestamp
- Playback last-change timestamp
- Playback master device identifier

The following fields are client-input (set by the host or guest):
- Party display name
- Party country code
- All party settings fields
- Track votes (guest action)
- Target playing state (host toggle request)

### Nullable vs. Absent

Several optional fields in the reference use optional-property syntax, meaning they may be entirely absent from a serialized object rather than present-as-null. On the wire (API JSON) and in Postgres, the team should decide on a consistent convention: prefer explicit null columns over absent keys so that schema evolution is safer. Specifically: party settings, track played-at timestamp, track background images, and track ISRC should be nullable columns rather than omitted keys.

### Connection State in Our Stack

Connection state (Unknown / Connected / Disconnected) maps to a Zustand slice, not to a Redux reducer. Because our stack uses TanStack Query for data fetching and does not use Firebase real-time subscriptions, the "connected" concept will shift. Specifically: if the party queue is fetched via polling (TanStack Query "refetchInterval"), there is no persistent WebSocket to be "connected" or "disconnected" from. The implementer should decide whether to: (a) retain connection state as a concept backed by a WebSocket or Server-Sent Events channel for real-time updates, or (b) replace it with TanStack Query's "fetchStatus" / "isStale" indicators. Option (a) is recommended for a live-queue party experience.

### Vote Count Integrity

The vote count on a Track is a denormalized integer. In the reference this is maintained via Firebase RTDB transactions (atomic increment). In Postgres the equivalent is an "UPDATE tracks SET vote_count = vote_count + 1 WHERE ..." statement executed inside a database transaction, with a separate "user_votes" junction table to prevent double-voting per user per track. The implementer should add a unique constraint on (party_id, user_id, track_provider_id) in the user_votes table and use the ON CONFLICT clause to make the vote upsert idempotent.

### Player State

The PlayerState shape contains several flags relating to the Spotify Web Playback SDK, which is a browser-only JavaScript SDK. This entire slice is frontend-only and has no backend equivalent. The "instance ID" (a tab-local stable identifier) and the "local device ID" (assigned by Spotify) are both ephemeral and should never be persisted to Postgres. The implementer should keep this slice in a Zustand store that is reset on page unload.

### Auth Provider Complexity

The reference tracks six separate auth providers (Facebook, GitHub, Google, Twitter, Firebase session, Spotify) each with their own status. In our stack, Neon Auth (Better Auth) is the single auth provider; the multi-provider credential fan-out does not apply. The UserState slice should be simplified to a single auth status (signed-in or not, with the user's JWT sub and display profile) plus the Spotify OAuth token status as a separate concern (since Spotify playback access requires its own OAuth token separate from app login). The "needs follow-up sign-in with providers" re-auth flow may not be needed if Neon Auth handles provider linking internally.

### Playback Master Negotiation

The "master player" concept (one browser tab is elected as the controlling audio output device) is specific to the Spotify Web Playback SDK's device model. This field should be preserved in the domain model because it informs which client shows playback controls vs. passive display. However, the selection mechanism (how master is elected or transferred) is defined in a separate actions/sagas module (separate translation task).

### Field Naming (Snake Case vs. Camel Case)

Several entity fields in the reference use snake_case (for example: "created_at", "created_by", "is_fallback", "vote_count", "last_change", "last_position_ms", "master_id", "short_id", "added_at", "played_at"). These names reflect Firebase RTDB key conventions. In our stack, Postgres columns should follow snake_case (which aligns), Go struct fields should follow PascalCase with JSON tags in camelCase (for API responses), and TypeScript entity types should use camelCase throughout. The implementer should define a consistent mapping in the OpenAPI schema and ensure the Go sqlc-generated structs and the TypeScript generated types both respect it.

### Domain Selector Dependency

The default TV mode text in party settings references a "domain selector" utility imported from a separate selectors module. This utility returns the service's public URL or domain name. In our stack, this value should come from a build-time environment variable (for example, VITE_PUBLIC_URL on the frontend or an env var on the backend). The implementer should wire this into the default settings factory so that the invite text is correct per deployment environment.

---

## 7. Stack Mapping Notes

### Frontend (React + FSD)

Each major noun in this file maps to an FSD entity slice under "apps/web/src/entities/". Suggested slices:

- "party" entity: holds the Party, PartySettings, and Playback types plus a Zustand slice for PartyState.
- "track" entity: holds the Track, TrackReference, and Metadata types.
- "user" entity: holds simplified auth status and user profile (not the multi-provider fan-out from the reference; see open questions).
- "playlist" entity: holds Playlist and PlaylistReference types.
- "player" entity: holds PlayerState as a Zustand slice (frontend-only, no backend equivalent).

Each entity slice exports its types from a "model/types.ts" file and re-exports via the slice barrel "index.ts".

View-layer state shapes (HomeViewState, PartyViewState, SettingsViewState, AppShellState) belong in the corresponding page or widget slice, not in entity slices, because they are UI-local rather than domain-persisted.

ConnectionState maps to a Zustand slice in "apps/web/src/app/store/" or "apps/web/src/shared/model/". Its exact home depends on the implementer's decision about WebSocket vs. polling (see open questions).

The router location shape (imported from a routing library in the reference) is not a domain entity. TanStack Router provides its own location type; no custom shape is needed.

The reference uses Redux for global state management. Our stack uses Zustand for synchronous client state and TanStack Query for server state. The PartyState, PlayerState, HomeViewState, and SettingsViewState shapes map to Zustand stores. The "tracks", "metadata", "party", and "userVotes" data maps to TanStack Query caches backed by REST API calls, not direct Firebase subscriptions.

### Backend (Go + Gin + sqlc)

The following entities require Postgres tables and sqlc query files:

- "parties" table: columns for uuid primary key, short_code (unique), display_name, country_code, created_at (timestamptz), created_by (text, references JWT sub).
- "party_settings" table (or JSONB column on parties): one row per party, columns for each settings field.
- "playback_state" table (or JSONB column on parties): columns for last_change_at (timestamptz), last_position_ms (integer), master_client_id (text nullable), is_playing (boolean), target_playing (boolean nullable).
- "queue_tracks" table: columns for uuid primary key, party_id (FK), provider_name (text), provider_track_id (text), added_at (timestamptz), is_fallback (boolean), vote_count (integer, default 0), sort_order (numeric or integer), played_at (timestamptz nullable). Unique constraint on (party_id, provider_name, provider_track_id).
- "track_metadata" table: columns for provider_name, provider_track_id, title, duration_ms, is_playable, isrc (nullable), artists (text array or JSONB), cover_images (JSONB), fetched_at (timestamptz). Keyed by (provider_name, provider_track_id).
- "user_votes" table: columns for party_id, user_id (JWT sub), provider_name, provider_track_id, voted_at (timestamptz). Unique constraint on (party_id, user_id, provider_name, provider_track_id).

Go domain value objects (not sqlc-generated) live in "apps/api/internal/domain/". These mirror the TypeScript entity types at the semantic level and are used by handler logic before database persistence.

OpenAPI schema entries for these entities belong in "apps/api/openapi.yaml" under the "components/schemas" section. The implementer should run "oapi-codegen" to generate server stubs and "openapi-typescript" to generate TypeScript client types after defining the schemas.

### External Dependencies in the Reference (Separate Translation Tasks)

- "OAuthLoginProviders" is imported from the auth actions module. In our stack this concept simplifies to a single Neon Auth session; the multi-provider list is not needed. Flag as resolved-by-simplification, no separate translation needed unless the Spotify OAuth token flow requires its own provider entry.
- The router "Location" type is imported from a routing library. In our stack TanStack Router supplies this natively; no translation task needed.
- The Firebase "User" type is imported from Firebase auth types. In our stack the auth user shape is provided by Neon Auth / Better Auth. No translation needed; use the Neon Auth session type.
- The "domainSelector" utility is imported from the selectors module. Translates to a build-time environment variable read in the default settings factory. Simple; no separate translation task needed.
- The Spotify "UserObjectPrivate" type (used in the Spotify auth provider status) comes from the Spotify Web API type definitions package. If the team retains Spotify OAuth as a separate login concern, this type should be imported from the "@spotify/web-api-ts-sdk" package or equivalent, not hand-written.
