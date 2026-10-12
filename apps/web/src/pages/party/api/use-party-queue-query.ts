import { useQuery } from '@tanstack/react-query'
import { fetchQueue, type Track, type Metadata } from '@/entities/track'

export type UsePartyQueueQueryResult = {
  tracks: Track[]
  metadataByKey: Record<string, Metadata>
  isLoading: boolean
  error: Error | null
}

export function usePartyQueueQuery(partyId: string): UsePartyQueueQueryResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['party-queue', partyId],
    queryFn: () => fetchQueue(partyId),
    staleTime: 3000,
    refetchInterval: 3000,
  })
  return {
    tracks: data?.tracks ?? [],
    metadataByKey: data?.metadataByKey ?? {},
    isLoading,
    error: error as Error | null,
  }
}
