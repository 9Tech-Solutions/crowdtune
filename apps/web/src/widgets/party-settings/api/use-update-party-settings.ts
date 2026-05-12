import { useMutation } from '@tanstack/react-query'
import type { PartySettings } from '@/entities/party'

/**
 * Placeholder mutation: PATCH/PUT party settings to the backend.
 *
 * The mutationFn resolves immediately (no-op) until the backend endpoint
 * for updating party settings is implemented. When the real endpoint lands,
 * replace the mutationFn body and add cache invalidation for the party
 * query key.
 *
 * Deferred concern recorded in docs/translation-progress.md under the
 * party-settings section. The real implementation will call the project's
 * api() wrapper from @/shared/api and reject with ApiError on failure.
 *
 * @param partyId - The current party's identifier. Used in the mutationKey
 *   so distinct parties don't share mutation state.
 */
export function useUpdatePartySettings(partyId: string) {
  return useMutation<void, Error, PartySettings>({
    mutationKey: ['update-party-settings', partyId],
    mutationFn: () => Promise.resolve(),
  })
}
