import { useQuery } from '@tanstack/react-query'
import type { Playback } from '../model/types'
import { api } from '@/shared/api'

export type UsePlaybackQueryResult = {
  data: Playback | null
  isLoading: boolean
  error: Error | null
}

/**
 * Fetches the playback state for the given partyId.
 * Polls the live host state. An expired or released player lease returns null.
 */
export function usePlaybackQuery(partyId: string): UsePlaybackQueryResult {
  const {
    data = null,
    isLoading,
    error,
  } = useQuery<Playback | null, Error>({
    queryKey: ['playback', partyId],
    queryFn: () => api<Playback | null>(`/api/parties/${encodeURIComponent(partyId)}/playback`),
    refetchInterval: 3000,
  })

  return { data, isLoading, error }
}
