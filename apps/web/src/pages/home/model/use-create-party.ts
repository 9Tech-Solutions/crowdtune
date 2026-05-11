import { useMutation } from '@tanstack/react-query'

export type CreatePartyResult = { partyId: string }

/**
 * Placeholder create mutation for the first port.
 *
 * Resolves with a static placeholder partyId. The real implementation
 * will call POST /api/parties when that endpoint is built.
 */
export function useCreateParty() {
  return useMutation<CreatePartyResult, Error, void>({
    mutationFn: () => Promise.resolve({ partyId: 'placeholder' }),
  })
}
