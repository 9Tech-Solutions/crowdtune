import { useQuery } from '@tanstack/react-query'
import type { Party } from '@/entities/party'

export type UsePartyQueryResult = {
  data: Party | null
  isLoading: boolean
  error: Error | null
}

/**
 * Fetches the party record for the given partyId.
 * The queryFn resolves to null until the backend party endpoint is ported.
 * When the backend lands, only this queryFn changes.
 */
export function usePartyQuery(partyId: string): UsePartyQueryResult {
  const { data = null, isLoading, error } = useQuery<Party | null, Error>({
    queryKey: ['party', partyId],
    queryFn: () => Promise.resolve(null),
  })

  return { data, isLoading, error }
}
