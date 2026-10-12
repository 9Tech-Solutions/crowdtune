import { createFileRoute } from '@tanstack/react-router'
import { PartyTrackSearch } from '@/widgets/party-track-search'
import { isMusicProvider } from '@/shared/model'

export const Route = createFileRoute('/party/$partyId/search')({
  component: PartyTrackSearch,
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    provider: isMusicProvider(search.provider) ? search.provider : 'spotify',
  }),
})
