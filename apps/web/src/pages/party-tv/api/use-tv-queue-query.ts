import { useQuery } from '@tanstack/react-query'
import { fetchQueue, type Track, type Metadata } from '@/entities/track'

export type UseTvQueueQueryResult = {
  tracks: Track[]
  metadataByKey: Record<string, Metadata>
  isLoading: boolean
  error: Error | null
}

export function useTvQueueQuery(partyId: string): UseTvQueueQueryResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['party-tv-queue', partyId],
    queryFn: () => fetchQueue(partyId),
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
