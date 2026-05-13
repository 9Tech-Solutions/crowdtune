/**
 * PartyShare widget.
 *
 * Mounts at /party/$partyId/share as a host-only sub-view of the party page
 * shell. Reads partyId from TanStack Router's useParams - no props accepted
 * from the route file.
 *
 * Host-gating: defensive check via party.hostUserId === currentUserId. If
 * the check fails, renders an unauthorized message (not a redirect).
 *
 * Web Share: rendered only when navigator.share is available. Rejection
 * (dismissed sheet) is swallowed silently with console.warn. (spec OQ-4)
 *
 * Copy decisions (all marked for product copy review):
 * - Description: "Guests can search and add songs directly, or visit [domain]
 *   and enter this code to join:" (spec OQ-1)
 * - Share body: "Join [party name] on CrowdTune and help choose the music!"
 *   (spec OQ-2)
 * - Share button label: "Share" with aria-label "Share party join link" (spec OQ-3)
 * - Unauthorized message: "Only the party host can view share options." (spec OQ-7)
 * - Loading label: "Loading party details..." (spec OQ-8)
 * - Join code aria-label: "Party join code" (spec OQ accessibility)
 *
 * URL vs. shortId: In CrowdTune the URL path segment IS the shortId. The
 * route param partyId equals party.shortId. Both the display code and the
 * share URL use partyId from useParams. (spec OQ-6)
 */
import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Spinner, Button } from '@heroui/react'

import type { Party } from '@/entities/party'
import { getSession } from '@/shared/auth'

import { useWebShare } from '../model/use-web-share'

// ---------------------------------------------------------------------------
// Internal hooks: read from caches already warmed by the party page shell
// ---------------------------------------------------------------------------

function usePartyFromCache(partyId: string): Party | null {
  const { data = null } = useQuery<Party | null, Error>({
    queryKey: ['party', partyId],
    queryFn: () => Promise.resolve(null),
    staleTime: Infinity,
  })
  return data
}

type CurrentUser = { userId: string | null; isLoading: boolean }

function useCurrentUser(): CurrentUser {
  const { data, isLoading } = useQuery({
    queryKey: ['session'],
    queryFn: () => getSession(),
    staleTime: 60_000,
  })
  return { userId: data?.id ?? null, isLoading }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PartyShare() {
  const { partyId } = useParams({ from: '/party/$partyId' })

  const party = usePartyFromCache(partyId)
  const { userId: currentUserId, isLoading: isSessionLoading } = useCurrentUser()
  const { isSupported: isShareSupported, share } = useWebShare()

  // Hold spinner until BOTH party record and session are resolved.
  // This prevents an unauthorized flash while session is pending.
  if (party === null || isSessionLoading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading party details..."
        className="flex items-center justify-center p-12"
      >
        <Spinner size="lg" aria-hidden="true" />
      </div>
    )
  }

  // Host-gate check. Non-hosts see a message with no share affordances.
  const isHostUser = currentUserId !== null && party.hostUserId === currentUserId

  if (!isHostUser) {
    return (
      <div className="flex items-center justify-center p-12" role="alert">
        <p className="text-sm text-muted">
          {/* product copy review */}
          Only the party host can view share options.
        </p>
      </div>
    )
  }

  // Derive the application origin and join URL at render time, not module scope.
  // Capture party.name into a local so the closure below doesn't re-widen the
  // narrowed Party type back to Party | null across the closure boundary.
  const origin = window.location.origin
  const joinUrl = `${origin}/party/${partyId}`
  const partyName = party.name

  async function handleShare() {
    await share({
      title: partyName,
      // product copy review (spec OQ-2)
      text: `Join ${partyName} on CrowdTune and help choose the music!`,
      url: joinUrl,
    })
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Description paragraph (spec OQ-1 - product copy review) */}
      <p className="text-sm">
        Guests can search and add songs directly, or visit{' '}
        <span
          className="underline whitespace-nowrap overflow-hidden text-ellipsis inline-block max-w-[16rem]"
          aria-label={`Application domain: ${origin}`}
        >
          {origin}
        </span>{' '}
        and enter this code to join:
      </p>

      {/* Join code display - large, centered, user-selectable */}
      <p
        aria-label="Party join code"
        className="text-center text-[2rem] font-bold select-text"
      >
        {/* Defensive fallback: backend always assigns shortId, but guard anyway */}
        {party.shortId || '-'}
      </p>

      {/* Share button - only when Web Share API is available */}
      {isShareSupported && (
        <div className="flex justify-center">
          <Button
            onPress={() => void handleShare()}
            aria-label="Share party join link"
          >
            {/* product copy review (spec OQ-3) */}
            Share
          </Button>
        </div>
      )}
    </div>
  )
}
