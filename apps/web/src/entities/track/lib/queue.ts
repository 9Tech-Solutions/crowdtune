import type { Track, Metadata } from '../model/types'
import { trackIdentityKey } from './identity'

type SortedQueueArgs = {
  tracks: Record<string, Track>
  metadata: Record<string, Metadata>
  maxTrackLengthMinutes: number | null
}

/**
 * Returns a filtered, sorted copy of the queue.
 *
 * Filter rules (applied in order):
 *  1. Exclude tracks with an incomplete reference (missing provider or id).
 *  2. Exclude tracks whose durationMs exceeds the limit when metadata is loaded.
 *     Tracks with no metadata entry are kept (duration unknown).
 *     maxTrackLengthMinutes of 0, null, or undefined means no limit.
 *
 * Sort: Track.order ascending (numeric).
 *  - NaN order → treated as +Infinity (sorted to end).
 *  - Tie-break: addedAt ascending (ISO 8601 UTC strings compare lex-safe).
 */
export function sortedQueue({
  tracks,
  metadata,
  maxTrackLengthMinutes,
}: SortedQueueArgs): Track[] {
  const limitMs =
    maxTrackLengthMinutes && maxTrackLengthMinutes > 0
      ? maxTrackLengthMinutes * 60_000
      : null

  const filtered = Object.values(tracks).filter((track) => {
    // Rule 1: complete reference required
    if (!track.ref?.provider || !track.ref?.id) return false

    // Rule 2: duration check (only when limit exists AND metadata is loaded)
    if (limitMs !== null) {
      const key = trackIdentityKey(track)
      const meta = metadata[key]
      if (meta !== undefined && meta.durationMs > limitMs) return false
    }

    return true
  })

  return filtered.sort((a, b) => {
    const orderA = Number.isNaN(a.order) ? Number.POSITIVE_INFINITY : a.order
    const orderB = Number.isNaN(b.order) ? Number.POSITIVE_INFINITY : b.order
    if (orderA !== orderB) return orderA - orderB
    // Tie-break: addedAt ascending (ISO 8601 UTC strings are lex-safe)
    if (a.addedAt < b.addedAt) return -1
    if (a.addedAt > b.addedAt) return 1
    return 0
  })
}

/**
 * Returns the first track in the sorted queue (the current/head track),
 * or null when the queue is empty.
 */
export function currentTrack(queue: Track[]): Track | null {
  return queue[0] ?? null
}

/**
 * Returns the canonical identity key of the current (head) track,
 * or null when the queue is empty.
 */
export function currentTrackKey(queue: Track[]): string | null {
  const head = currentTrack(queue)
  return head !== null ? trackIdentityKey(head) : null
}
