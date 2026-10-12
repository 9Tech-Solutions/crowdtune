import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { TrackReference } from '@/entities/track'

export function useAddTrack(partyId: string) {
  const cache = useQueryClient()
  return useMutation<void, Error, TrackReference>({
    mutationKey: ['add-track', partyId],
    mutationFn: async (reference) => {
      await api(
        `/api/parties/${encodeURIComponent(partyId)}/tracks/${reference.provider}/${encodeURIComponent(reference.id)}/vote`,
        { method: 'PUT' },
      )
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['party-queue', partyId] }),
        cache.invalidateQueries({ queryKey: ['party-tv-queue', partyId] }),
      ])
    },
  })
}
