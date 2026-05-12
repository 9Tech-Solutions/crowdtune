import { useMutation } from '@tanstack/react-query'

/**
 * Placeholder mutation: PATCH the party name to the backend.
 *
 * Party name is a field on the `Party` record (not on `PartySettings`), so it
 * needs its own mutation distinct from `useUpdatePartySettings`. The
 * mutationFn resolves immediately (no-op) until the backend endpoint for
 * updating party metadata is implemented. When the real endpoint lands,
 * replace the mutationFn body and add cache invalidation for the party
 * query key so the page re-renders with the new name.
 *
 * Deferred concern recorded in docs/translation-progress.md under the
 * party-settings section. The real implementation will call the project's
 * api() wrapper from @/shared/api and reject with ApiError on failure.
 *
 * @param partyId - The current party's identifier. Used in the mutationKey
 *   so distinct parties don't share mutation state.
 */
export function useUpdatePartyName(partyId: string) {
  return useMutation<void, Error, string>({
    mutationKey: ['update-party-name', partyId],
    mutationFn: () => Promise.resolve(),
  })
}
