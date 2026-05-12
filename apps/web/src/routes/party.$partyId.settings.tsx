import { createFileRoute } from '@tanstack/react-router'
import { PartySettings } from '@/widgets/party-settings'

export const Route = createFileRoute('/party/$partyId/settings')({
  component: PartySettings,
})
