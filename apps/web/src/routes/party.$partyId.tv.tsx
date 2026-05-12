import { createFileRoute } from '@tanstack/react-router'
import { PartyTvPage } from '@/pages/party-tv'

export const Route = createFileRoute('/party/$partyId/tv')({
  component: PartyTvPage,
})
