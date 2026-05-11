import { useQuery } from '@tanstack/react-query'
import type { Metadata, TrackReference } from '@/entities/track'

/**
 * A single search result entry returned by the tracks search endpoint.
 */
export type SearchResult = {
  trackRef: TrackReference
  metadata: Metadata | null
}

/**
 * Placeholder hook for the track search query.
 *
 * Current behavior: returns an empty array immediately for any query without
 * issuing a network request. The hook's signature and enabled/disabled pattern
 * are production-ready - swap in the real queryFn when the backend search
 * endpoint lands.
 *
 * Deferred concern recorded in docs/translation-progress.md under
 * party-track-search. The backend endpoint will proxy Spotify's track search
 * API. Results are capped at 20 per the lock-now decision in the spec.
 *
 * @param partyId - The current party's identifier (used as a cache-key segment).
 * @param query - The debounced, trimmed search string. Empty string = idle.
 */
export function useSearchTracks(partyId: string, query: string) {
  const trimmedQuery = query.trim()
  const isEnabled = trimmedQuery.length > 0

  return useQuery<SearchResult[]>({
    queryKey: ['search-tracks', partyId, trimmedQuery],
    queryFn: () => Promise.resolve([]),
    enabled: isEnabled,
    staleTime: 30_000,
    retry: false,
  })
}
