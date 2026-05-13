import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { TrackReference } from '@/entities/track'

export type VoteVariables = { ref: TrackReference; newVote: boolean }

/**
 * Casts or retracts a vote on a queue track via the Phase 10 vote endpoints.
 *
 * PUT  /api/parties/:id/tracks/:provider/:trackId/vote — cast (idempotent)
 * DELETE /api/parties/:id/tracks/:provider/:trackId/vote — retract (idempotent)
 *
 * Both endpoints may return 200 (track updated) or 204 (no-op / track gone).
 * The mutation result type is void because the caller should not consume the
 * body directly; the queue refetch on success surfaces the new state instead.
 *
 * On success both ['party-queue', partyId] and ['party-tv-queue', partyId]
 * caches are invalidated so navigating between PartyPage and PartyTvPage
 * picks up the new vote state without a manual refresh.
 *
 * No optimistic update: the 3-second refetchInterval on usePartyQueueQuery
 * is fast enough, and rollback complexity is deferred to a follow-up once
 * vote state is owned at the entity layer.
 */
export function useVote(partyId: string) {
  const queryClient = useQueryClient()

  return useMutation<void, Error, VoteVariables>({
    mutationFn: async ({ ref, newVote }) => {
      const encodedParty = encodeURIComponent(partyId)
      const encodedProvider = encodeURIComponent(ref.provider)
      const encodedId = encodeURIComponent(ref.id)
      const path = `/api/parties/${encodedParty}/tracks/${encodedProvider}/${encodedId}/vote`

      await api<void>(path, { method: newVote ? 'PUT' : 'DELETE' })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['party-queue', partyId] })
      void queryClient.invalidateQueries({ queryKey: ['party-tv-queue', partyId] })
    },
  })
}
