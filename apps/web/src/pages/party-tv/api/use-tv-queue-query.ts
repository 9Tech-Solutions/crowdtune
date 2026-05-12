import { useQuery } from '@tanstack/react-query'
import type { Track, Metadata } from '@/entities/track'

export type UseTvQueueQueryResult = {
  tracks: Track[]
  metadataByKey: Record<string, Metadata>
  isLoading: boolean
  error: Error | null
}

/**
 * Fetches the sorted queue tracks and metadata for the TV mode page.
 *
 * Polling at 5-second intervals (OQ-1 lock: refetchInterval strategy).
 * Returns placeholder empty values until the backend queue endpoint is wired.
 */
export function useTvQueueQuery(partyId: string): UseTvQueueQueryResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['party-tv-queue', partyId],
    queryFn: (): Promise<{ tracks: Track[]; metadataByKey: Record<string, Metadata> }> =>
      Promise.resolve({ tracks: [], metadataByKey: {} }),
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
