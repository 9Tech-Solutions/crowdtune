import { useMutation } from '@tanstack/react-query'

export type JoinPartyResult = { partyId: string }

export type JoinPartyVariables = { partyCode: string }

/**
 * Placeholder join mutation for the first port.
 *
 * Resolves synchronously with the entered code as the partyId so tests
 * can verify navigation without a backend round-trip. The real implementation
 * will call GET /api/parties/lookup when that endpoint is built.
 */
export function useJoinParty() {
  return useMutation<JoinPartyResult, Error, JoinPartyVariables>({
    mutationFn: ({ partyCode }) => Promise.resolve({ partyId: partyCode }),
  })
}
