import { useQuery } from '@tanstack/react-query'
import type { Playback } from '@/entities/party'

export type UsePlaybackQueryResult = {
  data: Playback | null
  isLoading: boolean
  error: Error | null
}

/**
 * Fetches the playback state for the given partyId.
 * The queryFn resolves to null until the backend playback endpoint is ported.
 * When the backend lands, only this queryFn changes.
 */
export function usePlaybackQuery(partyId: string): UsePlaybackQueryResult {
  const { data = null, isLoading, error } = useQuery<Playback | null, Error>({
    queryKey: ['playback', partyId],
    queryFn: () => Promise.resolve(null),
  })

  return { data, isLoading, error }
}
