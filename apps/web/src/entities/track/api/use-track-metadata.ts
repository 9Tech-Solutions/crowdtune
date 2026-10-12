import { useQueries } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { Track, Metadata } from '../model/types'
import { trackIdentityKey } from '../lib/identity'

export function useTrackMetadata(partyId: string, tracks: Track[]): Record<string, Metadata> {
  const queries = useQueries({
    queries: tracks.map((track) => ({
      queryKey: ['track-metadata', partyId, track.ref.provider, track.ref.id],
      queryFn: () =>
        api<Metadata>(
          `/api/parties/${encodeURIComponent(partyId)}/music/metadata?${new URLSearchParams(track.ref)}`,
        ),
      staleTime: 60_000,
      retry: false,
    })),
  })
  const metadata: Record<string, Metadata> = {}
  tracks.forEach((track, index) => {
    const data = queries[index]?.data
    if (data) metadata[trackIdentityKey(track)] = data
  })
  return metadata
}
