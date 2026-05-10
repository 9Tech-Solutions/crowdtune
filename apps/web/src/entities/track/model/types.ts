/**
 * Track entity types.
 *
 * Timestamps are ISO 8601 strings in UTC on the wire and in these types.
 * Conversion to Date or epoch ms happens at the API boundary, not here.
 */

import type { Image } from '@/shared/model'

/**
 * Pointer to a specific song in a specific streaming provider.
 * The provider union has one member now; adding providers is a deliberate
 * type change, which is the right friction to prevent accidental drift.
 */
export type TrackReference = {
  /** Opaque string identifier assigned by the streaming provider. */
  id: string
  /** Name of the streaming provider. Currently only 'spotify' is supported. */
  provider: 'spotify'
}

/**
 * Display information about a track fetched from the streaming provider.
 * Stored separately from the queue entry, keyed by provider track ID.
 */
export type Metadata = {
  /** Track title as a display string. */
  title: string
  /** Ordered list of artist display names (at least one element). */
  artists: string[]
  /**
   * Album artwork images. May be empty if the provider returns none.
   * Ordered as returned by the provider.
   */
  coverImages: Image[]
  /** Total playback duration in milliseconds (non-negative integer). */
  durationMs: number
  /** Whether the track is playable in the party's country. */
  isPlayable: boolean
  /**
   * Optional background image URLs for ambient/TV display.
   * Absent when not provided by the provider.
   */
  backgroundImages?: string[]
  /**
   * International Standard Recording Code, used for deduplication or
   * royalty tracking. Absent when not provided by the provider.
   */
  isrc?: string
}

/** A single song entry in the party queue. */
export type Track = {
  /** Pointer to the track in its streaming provider. */
  ref: TrackReference
  /**
   * ISO 8601 timestamp of when this track was added to the queue (UTC,
   * server-authoritative).
   */
  addedAt: string
  /**
   * Whether this track came from the host's fallback playlist rather than
   * a guest vote. Fallback tracks bypass the explicit-content filter.
   */
  isFallback: boolean
  /**
   * Net number of upvotes (non-negative integer). Determines queue ordering.
   * Maintained via atomic DB increment; never set by client directly.
   */
  voteCount: number
  /**
   * Position of this track in the sorted queue (non-negative number).
   * Distinct from voteCount: two tracks with equal votes are still ordered
   * deterministically via this field.
   */
  order: number
  /**
   * ISO 8601 timestamp of when this track was last played (UTC).
   * Absent until the track has been played at least once.
   */
  playedAt?: string
}
