// FSD violation: cross-slice import from entities/party (same layer).
// Playback will be lifted to shared/model when a third slice needs it.
import type { Playback } from '@/entities/party'

import type { Track, Metadata } from '../model/types'
import { tracksAreEqual } from './identity'

/**
 * Joins the artist list from a Metadata object into a display-ready string.
 *
 * Returns:
 *  - null when metadata is absent or has zero artists.
 *  - The single artist name when there is exactly one.
 *  - "Primary feat. Second & Third" format for two or more artists.
 */
export function formatArtists(metadata: Metadata | null | undefined): string | null {
  if (metadata == null || metadata.artists.length === 0) return null
  if (metadata.artists.length === 1) return metadata.artists[0]

  const [primary, ...rest] = metadata.artists
  return `${primary} feat. ${rest.join(' & ')}`
}

type VoteStatusArgs = {
  track: Track | null | undefined
  currentTrack: Track | null
  playback: Playback | null | undefined
}

/**
 * Produces a human-readable vote-status label for a queued track.
 *
 * Evaluation order (per spec lock-now decision 6):
 *  1. track or playback absent → ''
 *  2. track is the current track:
 *     - playing → 'Now playing'
 *     - paused  → 'Paused'
 *  3. voteCount > 1  → '${voteCount} votes'
 *  4. voteCount === 1 → '1 vote'
 *  5. voteCount === 0 && isFallback → 'Host pick'
 *  6. voteCount === 0 && !isFallback → 'Pending'
 *  7. anything else → ''
 */
export function voteStatusLabel({ track, currentTrack, playback }: VoteStatusArgs): string {
  if (track == null || playback == null) return ''

  if (tracksAreEqual(track, currentTrack)) {
    return playback.playing ? 'Now playing' : 'Paused'
  }

  const votes = track.voteCount ?? 0

  if (votes > 1) return `${votes} votes`
  if (votes === 1) return '1 vote'
  if (track.isFallback) return 'Host pick'
  return 'Pending'
}
