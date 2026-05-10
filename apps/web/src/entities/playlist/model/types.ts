/**
 * Playlist entity types.
 *
 * A Playlist is a Spotify playlist the host designates as a fallback source
 * to fill dead air when no guest votes are pending.
 */

/**
 * Pointer to a Spotify playlist, extending the concept of a track reference
 * with ownership information.
 */
export type PlaylistReference = {
  /** Opaque string identifier assigned by the streaming provider. */
  id: string
  /** Name of the streaming provider. Currently only 'spotify' is supported. */
  provider: 'spotify'
  /**
   * Spotify user ID of the playlist owner.
   * Named spotifyUserId (not userId) to avoid collision with the app's
   * JWT sub claim, which is the canonical app user identity.
   */
  spotifyUserId: string
}

/** A Spotify playlist the host can designate as a fallback source. */
export type Playlist = {
  /** Human-readable display name of the playlist. */
  name: string
  /** Pointer to the playlist in the streaming provider. */
  ref: PlaylistReference
  /** Total number of tracks in the playlist (non-negative integer). */
  trackCount: number
}
