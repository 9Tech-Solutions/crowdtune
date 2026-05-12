import { createFileRoute } from '@tanstack/react-router'
import { PartyShare } from '@/widgets/party-share'

export const Route = createFileRoute('/party/$partyId/share')({
  component: PartyShare,
})
