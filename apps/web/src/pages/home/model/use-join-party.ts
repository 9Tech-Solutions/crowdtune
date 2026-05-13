import { useMutation } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { Party } from '@/entities/party'

export type JoinPartyResult = { partyId: string }

export type JoinPartyVariables = { partyCode: string }

/**
 * Looks up the party for the given short code via GET /api/parties/:code.
 * Returns the resolved party id, which HomePage uses to navigate the guest
 * into the party. The lookup is non-destructive; no membership row is created
 * on the backend (URL-as-membership model per Phase 10 Q8).
 *
 * On 404, the api() wrapper throws an ApiError whose message is "party not
 * found" (the backend error envelope). HomePage's toJoinError pattern-matches
 * on the lowercase message to surface the 'not-found' branch. Other 4xx/5xx
 * fall through to the 'network' branch.
 */
export function useJoinParty() {
  return useMutation<JoinPartyResult, Error, JoinPartyVariables>({
    mutationFn: async ({ partyCode }) => {
      const party = await api<Party>(
        `/api/parties/${encodeURIComponent(partyCode)}`,
      )
      return { partyId: party.id }
    },
  })
}
