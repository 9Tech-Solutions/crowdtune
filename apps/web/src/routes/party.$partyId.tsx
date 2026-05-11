import { createFileRoute } from '@tanstack/react-router'
import { PartyPage } from '@/pages/party'

export const Route = createFileRoute('/party/$partyId')({
  component: PartyPage,
})
