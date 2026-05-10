/**
 * Party entity types.
 *
 * Timestamps are ISO 8601 strings in UTC on the wire and in these types.
 * Conversion to Date or epoch ms happens at the API boundary, not here.
 */

/**
 * Live playback state embedded inside Party.
 * Written by the backend; all clients read it.
 */
export type Playback = {
  /**
   * ISO 8601 timestamp of the last playback state change (UTC).
   * Clients add elapsed wall-clock time to lastPositionMs when playing is true
   * to derive the current live position without polling.
   */
  lastChange: string
  /**
   * Playback position in milliseconds at the time of lastChange.
   * Not the current live position - see above.
   */
  lastPositionMs: number
  /**
   * Opaque device/client identifier of the "master" player controlling audio output.
   * Null when no master player is active.
   */
  masterId: string | null
  /** Whether audio is currently playing (server-authoritative). */
  playing: boolean
  /**
   * Desired future playing state requested by the host but not yet confirmed.
   * Null means no pending change. Non-null means show a transitioning state in UI.
   */
  targetPlaying: boolean | null
}

/**
 * Host-adjustable configuration knobs for a party.
 * When absent from the Party object, all fields take their defaults.
 */
export type PartySettings = {
  /** Whether anonymous (unauthenticated) users may vote. Default: true. */
  allowAnonymousVoting: boolean
  /** Whether tracks with explicit content can be added via search. Default: true. */
  allowExplicitTracks: boolean
  /**
   * Whether the search panel stays open after each vote (true) or closes
   * after the first vote (false). Default: true.
   */
  allowMultipleVotesPerSearch: boolean
  /**
   * Free-text string shown beneath the progress bar in TV/large-display mode.
   * Default: a short call-to-action referencing the service domain.
   */
  tvDisplayText: string
  /**
   * Maximum track length in whole minutes. Null means no limit.
   * Tracks exceeding this value cannot be added via search.
   */
  maxTrackLengthMinutes: number | null
}

/** A live music session that guests join to collectively control playback. */
export type Party = {
  /**
   * Human-facing join code (short alphanumeric, server-assigned, unique).
   * Used in URL paths and typed by guests to join. Not the DB primary key.
   */
  shortId: string
  /** Display name chosen by the host. */
  name: string
  /** ISO 3166-1 alpha-2 country code where the party is hosted. */
  countryCode: string
  /**
   * ISO 8601 timestamp of when the party was created (UTC, server-authoritative).
   */
  createdAt: string
  /**
   * Opaque identifier of the user who created the party.
   * References the auth user record (JWT sub claim, server-authoritative).
   */
  createdBy: string
  /** Live playback state. */
  playback: Playback
  /**
   * Optional host configuration. When absent, all PartySettings fields take
   * their documented defaults. Consumers must not modify backend state to
   * supply missing defaults.
   */
  settings?: PartySettings
}
