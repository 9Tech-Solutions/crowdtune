import type { Track, Metadata } from '../model/types'
import { trackIdentityKey } from './identity'

type FanartArgs = {
  queue: Track[]
  metadata: Record<string, Metadata>
}

/**
 * Returns up to two [identityKey, Metadata] pairs from the head of the queue
 * that have metadata loaded but no backgroundImages yet.
 *
 * Tracks with no metadata entry are skipped (cannot load fanart without metadata).
 * Tracks that already have backgroundImages are skipped.
 */
export function fanartLoadCandidates({ queue, metadata }: FanartArgs): Array<[string, Metadata]> {
  const result: Array<[string, Metadata]> = []

  for (const track of queue) {
    if (result.length >= 2) break

    const key = trackIdentityKey(track)
    const meta = metadata[key]

    if (meta === undefined) continue
    if (meta.backgroundImages !== undefined && meta.backgroundImages.length > 0) continue

    result.push([key, meta])
  }

  return result
}

type MetadataArgs = {
  queue: Track[]
  metadata: Record<string, Metadata>
}

/**
 * Returns provider-native ids (raw ref.id, NOT composite identity keys) of
 * tracks that are missing metadata entirely or whose durationMs is absent.
 *
 * Walks the full queue (not just the first two tracks).
 */
export function metadataLoadCandidates({ queue, metadata }: MetadataArgs): string[] {
  const ids: string[] = []

  for (const track of queue) {
    const key = trackIdentityKey(track)
    const meta = metadata[key]

    const needsFetch = meta === undefined || meta.durationMs == null
    if (needsFetch) {
      ids.push(track.ref.id)
    }
  }

  return ids
}
