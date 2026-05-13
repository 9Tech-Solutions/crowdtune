import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { Party } from '@/entities/party'

export type UsePartyQueryResult = {
  data: Party | null
  isLoading: boolean
  error: Error | null
}

/**
 * Fetches the party record for the given partyId via GET /api/parties/:id.
 *
 * Cache key is ['party', partyId]. PartyShare, PartySettings, and PartyTvPage
 * read from this cache via their own useQuery calls with the same key and
 * staleTime: Infinity; PartyPage is the source-of-truth fetch site that
 * warms the cache. (A follow-up cleanup is to consolidate those inlined
 * cache reads onto this hook so the queryFn lives in one place.)
 *
 * Error mapping: any non-2xx (404, 500, network) propagates as an ApiError
 * from the api() wrapper. PartyPage observes error truthy and renders the
 * generic "Party not found / link no longer valid" landing - the same UI
 * for every failure mode, which is acceptable while the only practical
 * failures are 404 and offline.
 *
 * 60-second staleTime keeps cache reads cheap during navigation between
 * sub-routes (queue / search / settings / share / tv) while still picking
 * up host edits (party rename, settings change) on a soft refresh.
 */
export function usePartyQuery(partyId: string): UsePartyQueryResult {
  const { data = null, isLoading, error } = useQuery<Party, Error>({
    queryKey: ['party', partyId],
    queryFn: () => api<Party>(`/api/parties/${encodeURIComponent(partyId)}`),
    staleTime: 60_000,
  })

  return { data, isLoading, error }
}
