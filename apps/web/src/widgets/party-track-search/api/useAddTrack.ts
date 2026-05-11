import { useMutation } from '@tanstack/react-query'
import type { TrackReference } from '@/entities/track'

/**
 * Placeholder hook for the add-track (vote) mutation.
 *
 * Current behavior: resolves immediately with no payload and issues no network
 * request. The hook's shape matches the production contract - swap in the real
 * mutationFn when the backend add-track endpoint lands.
 *
 * When implemented, the mutationFn will POST the track reference to the
 * backend add-track endpoint. On success, it will invalidate the party queue
 * cache so the queue view reflects the new track. On failure, the error
 * surfaces at the widget level as a toast notification.
 *
 * Underlying action: "add" and "vote" share the same endpoint. If the track
 * is not yet queued, the POST creates the entry with vote count 1. If already
 * queued, it increments the vote count for the current user.
 *
 * Deferred concern recorded in docs/translation-progress.md under
 * party-track-search.
 *
 * @param partyId - The current party's identifier.
 */
export function useAddTrack(partyId: string) {
  return useMutation<void, Error, TrackReference>({
    mutationKey: ['add-track', partyId],
    mutationFn: () => Promise.resolve(),
  })
}
