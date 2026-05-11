import { createFileRoute } from '@tanstack/react-router'
import { PartyTrackSearch } from '@/widgets/party-track-search'

export const Route = createFileRoute('/party/$partyId/search')({
  component: PartyTrackSearch,
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : undefined,
  }),
})
