import { isMusicProvider } from '@/shared/model'
import { api } from '@/shared/api'
import type { Track, Metadata } from '../model/types'
import { trackIdentityKey } from '../lib/identity'

export type BackendQueueTrack = {
  reference: { provider: string; id: string }
  voteCount: number
  orderIdx: number
  isFallback: boolean
  addedAt: string
  metadata?: Metadata | null
}

export function adaptQueue(rows: BackendQueueTrack[]) {
  const tracks: Track[] = []
  const metadataByKey: Record<string, Metadata> = {}
  for (const row of rows) {
    if (!isMusicProvider(row.reference.provider)) continue
    const track: Track = {
      ref: { provider: row.reference.provider, id: row.reference.id },
      addedAt: row.addedAt,
      isFallback: row.isFallback,
      voteCount: row.voteCount,
      order: row.orderIdx,
    }
    tracks.push(track)
    if (row.metadata) metadataByKey[trackIdentityKey(track)] = row.metadata
  }
  return { tracks, metadataByKey }
}

export async function fetchQueue(partyId: string) {
  const response = await api<{ tracks: BackendQueueTrack[] }>(
    `/api/parties/${encodeURIComponent(partyId)}/tracks`,
  )
  return adaptQueue(response.tracks)
}
