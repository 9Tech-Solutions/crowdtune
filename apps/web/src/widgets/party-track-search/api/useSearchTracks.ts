import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { MusicProvider } from '@/shared/model'
import { parseTrackLink, type Metadata, type TrackReference } from '@/entities/track'

export type SearchResult = { trackRef: TrackReference; metadata: Metadata | null }

export function useSearchTracks(
  partyId: string,
  query: string,
  provider: MusicProvider = 'spotify',
) {
  const trimmed = query.trim()
  return useQuery<SearchResult[]>({
    queryKey: ['search-tracks', partyId, provider, trimmed],
    queryFn: async () => {
      const reference = parseTrackLink(trimmed)
      if (reference) {
        const metadata = await api<Metadata>(
          `/api/parties/${encodeURIComponent(partyId)}/music/metadata?${new URLSearchParams(reference)}`,
        ).catch(() => null)
        return [{ trackRef: reference, metadata }]
      }
      if (/^(https?:|spotify:)/i.test(trimmed))
        throw new Error('Paste a Spotify track, Apple Music song, or YouTube video link.')
      return api<SearchResult[]>(
        `/api/parties/${encodeURIComponent(partyId)}/music/search?${new URLSearchParams({ provider, q: trimmed })}`,
      )
    },
    enabled: trimmed.length > 0,
    staleTime: 30_000,
    retry: false,
  })
}
