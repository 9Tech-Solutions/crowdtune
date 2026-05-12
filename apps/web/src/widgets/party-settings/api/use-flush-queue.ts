import { useMutation } from '@tanstack/react-query'

/**
 * Placeholder mutation: POST to the flush-queue backend endpoint.
 *
 * The mutationFn resolves immediately (no-op) until the backend endpoint
 * for flushing the party queue is implemented. When the real endpoint lands,
 * replace the mutationFn body and add cache invalidation for the queue
 * query key so the queue view re-fetches.
 *
 * Deferred concern recorded in docs/translation-progress.md under the
 * party-settings section. The real implementation will call the project's
 * api() wrapper from @/shared/api and reject with ApiError on failure.
 *
 * @param partyId - The current party's identifier. Used in the mutationKey
 *   so distinct parties don't share mutation state.
 */
export function useFlushQueue(partyId: string) {
  return useMutation<void, Error, void>({
    mutationKey: ['flush-queue', partyId],
    mutationFn: () => Promise.resolve(),
  })
}
