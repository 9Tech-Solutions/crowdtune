import { useMutation } from '@tanstack/react-query'
import { api } from '@/shared/api'
import type { Party } from '@/entities/party'

export type CreatePartyResult = { partyId: string }

/**
 * Default name applied when HomePage creates a party without a user-supplied
 * name. The host can rename later via PartySettings. Kept short and generic
 * so the UI doesn't surface a placeholder string to guests.
 */
const DEFAULT_PARTY_NAME = 'My Party'

/**
 * Creates a new party by POSTing to /api/parties. Returns the new party's id
 * (the 6-char short code), which HomePage uses to navigate the host into the
 * just-created party.
 *
 * Name handling: HomePage currently has no name-prompt UI, so the hook supplies
 * a hardcoded default. When a name-prompt lands, change the mutation signature
 * to accept the user-supplied name as a variable.
 *
 * Errors from api() bubble up as ApiError instances; HomePage maps them to a
 * generic create-failed message. The backend can return 400 invalid_field
 * (overlong name; not reachable with the current default) or 500.
 */
export function useCreateParty() {
  return useMutation<CreatePartyResult, Error, void>({
    mutationFn: async () => {
      const party = await api<Party>('/api/parties', {
        method: 'POST',
        body: { name: DEFAULT_PARTY_NAME },
      })
      return { partyId: party.id }
    },
  })
}
