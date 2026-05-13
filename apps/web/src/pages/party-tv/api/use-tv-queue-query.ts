import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { Track, Metadata } from '@/entities/track'

export type UseTvQueueQueryResult = {
  tracks: Track[]
  metadataByKey: Record<string, Metadata>
  isLoading: boolean
  error: Error | null
}

// Raw response shape from GET /api/parties/:id/tracks.
// Kept local because no other consumer needs it; the frontend Track type is
// the contract exposed to the rest of the app.
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
 * Maps a backend queue row to the frontend Track shape. The backend returns
 * `provider` as an open string while the frontend's TrackReference union is
 * currently locked to 'spotify'. The single-provider invariant is enforced
 * by filtering at the consumer level rather than widening the type, so a
 * future provider port is a deliberate type change.
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
 * Fetches the sorted queue for the TV mode page via GET /api/parties/:id/tracks.
 *
 * Polling at 5-second intervals (OQ-1 lock: refetchInterval strategy from
 * views-view-tv.spec.md). Non-spotify-provider rows are dropped defensively
 * until the TrackReference union widens.
 *
 * metadataByKey is intentionally empty for now. The backend queue endpoint
 * only returns reference + queue-state fields; track display metadata (title,
 * artists, cover art) comes from a future Spotify catalog endpoint that
 * batches lookups for the currently-rendered tracks. Until that endpoint
 * lands, TV mode's track rows show placeholder titles drawn from the
 * existing entities/track labels.
 */
export function useTvQueueQuery(partyId: string): UseTvQueueQueryResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['party-tv-queue', partyId],
    queryFn: async () => {
      const resp = await api<BackendQueueResponse>(
        `/api/parties/${encodeURIComponent(partyId)}/tracks`,
      )
      const tracks = resp.tracks
        .filter((t) => t.reference.provider === 'spotify')
        .map(toTrack)
      const metadataByKey: Record<string, Metadata> = {}
      return { tracks, metadataByKey }
    },
    staleTime: 5000,
    refetchInterval: 5000,
  })

  return {
    tracks: data?.tracks ?? [],
    metadataByKey: data?.metadataByKey ?? {},
    isLoading,
    error: error as Error | null,
  }
}
