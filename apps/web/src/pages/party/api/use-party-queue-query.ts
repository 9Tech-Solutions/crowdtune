import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { Track } from '@/entities/track'

export type UsePartyQueueQueryResult = {
  tracks: Track[]
  isLoading: boolean
  error: Error | null
}

// Raw response shape from GET /api/parties/:id/tracks.
type BackendQueueTrack = {
  reference: { provider: string; id: string }
  voteCount: number
  orderIdx: number
  isFallback: boolean
  addedAt: string
}

type BackendQueueResponse = {
  tracks: BackendQueueTrack[]
}

/**
 * Maps a backend queue row to the frontend Track shape.
 * Callers must filter to spotify-only rows before invoking this adapter;
 * the `provider` field is narrowed by the caller so this function can
 * safely cast to 'spotify' without widening the TrackReference union.
 */
function toTrack(raw: BackendQueueTrack): Track {
  return {
    ref: { provider: 'spotify', id: raw.reference.id },
    addedAt: raw.addedAt,
    isFallback: raw.isFallback,
    voteCount: raw.voteCount,
    order: raw.orderIdx,
  }
}

/**
 * Fetches the sorted queue for the party page via GET /api/parties/:id/tracks.
 *
 * Polling at 3-second intervals for snappier vote feedback on the active
 * participant view (TV mode uses 5s; party page users are actively voting).
 * Non-spotify-provider rows are dropped defensively until the TrackReference
 * union widens to support additional providers.
 */
export function usePartyQueueQuery(partyId: string): UsePartyQueueQueryResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['party-queue', partyId],
    queryFn: async () => {
      const resp = await api<BackendQueueResponse>(
        `/api/parties/${encodeURIComponent(partyId)}/tracks`,
      )
      return resp.tracks
        .filter((t) => t.reference.provider === 'spotify')
        .map(toTrack)
    },
    staleTime: 3000,
    refetchInterval: 3000,
  })

  return {
    tracks: data ?? [],
    isLoading,
    error: error as Error | null,
  }
}
