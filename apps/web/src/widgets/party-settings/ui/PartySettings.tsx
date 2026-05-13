/**
 * PartySettings widget.
 *
 * Mounts at /party/$partyId/settings as a host-only sub-view of the party
 * page shell. Reads partyId from TanStack Router's useParams - no props
 * accepted from the route file.
 *
 * Host-gating: defensive check via party.hostUserId === currentUserId. If
 * the check fails, renders an unauthorized message (not a redirect).
 *
 * Auto-save: toggles fire on flip, text/number inputs fire on blur-when-changed.
 * No Save button. Success is silent; failure shows a console.warn interim
 * fallback (same pattern as PartyTrackSearch) and does NOT revert the value
 * (placeholder is a no-op; reversion is wired when the real backend lands).
 *
 * Deferred concerns recorded in docs/translation-progress.md:
 * - useUpdatePartySettings backend implementation
 * - useFlushQueue backend implementation
 * - useInsertPlaylist backend implementation
 * - useHostPlaylists backend implementation
 * - Spotify OAuth integration (Phase 9c)
 * - Toast primitive wiring (when the toast API is available)
 */
import { useState, useRef } from 'react'
import { useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Spinner } from '@heroui/react'

import type { Party, PartySettings } from '@/entities/party'
import { getSession } from '@/shared/auth'

import { DEFAULT_SETTINGS } from '../model/defaults'
import { useUpdatePartySettings } from '../api/use-update-party-settings'
import { useUpdatePartyName } from '../api/use-update-party-name'
import { useFlushQueue } from '../api/use-flush-queue'
import { useInsertPlaylist } from '../api/use-insert-playlist'
import { useHostPlaylists } from '../api/use-host-playlists'
import { GeneralSettingsPanel } from './GeneralSettingsPanel'
import { PlaylistPanel } from './PlaylistPanel'

// ---------------------------------------------------------------------------
// Internal hook: read from the party cache already warmed by the page shell
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
// Placeholder: Spotify connection status
// Colocated here rather than importing from pages/home/model because this
// widget is in a different FSD layer. Replace when the real status endpoint
// is available (Phase 9c).
// ---------------------------------------------------------------------------

function useSpotifyStatusPlaceholder(): { isConnected: boolean } {
  return { isConnected: false }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PartySettings() {
  const { partyId } = useParams({ from: '/party/$partyId' })

  const party = usePartyFromCache(partyId)
  const { userId: currentUserId, isLoading: isSessionLoading } = useCurrentUser()
  const { isConnected: isSpotifyConnected } = useSpotifyStatusPlaceholder()

  const updateSettings = useUpdatePartySettings(partyId)
  const updateName = useUpdatePartyName(partyId)
  const flushQueue = useFlushQueue(partyId)
  const insertPlaylist = useInsertPlaylist(partyId)
  const { data: playlists, isLoading: playlistsLoading } = useHostPlaylists(
    partyId,
    isSpotifyConnected,
  )

  const [playlistFilter, setPlaylistFilter] = useState('')
  const [isSpotifyAuthInProgress, setIsSpotifyAuthInProgress] = useState(false)

  const flushButtonRef = useRef<HTMLButtonElement | null>(null)

  // ---------------------------------------------------------------------------
  // Loading state: party record OR session not yet available.
  //
  // Both must be resolved before the host-gate evaluation runs, otherwise the
  // unauthorized branch flashes while the session query is pending (currentUserId
  // is null in both "no session" and "still fetching" states).
  // ---------------------------------------------------------------------------
  if (party === null || isSessionLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" aria-label="Loading settings..." />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Host-gate check
  // ---------------------------------------------------------------------------
  const isHostUser = currentUserId !== null && party.hostUserId === currentUserId

  if (!isHostUser) {
    return (
      <div className="flex items-center justify-center p-12" role="alert">
        <p className="text-sm text-muted">Only the party host can access settings.</p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Resolved settings (fill defaults when party.settings is absent)
  // ---------------------------------------------------------------------------
  const settings: PartySettings = party.settings ?? DEFAULT_SETTINGS

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------
  function handleSave(next: PartySettings) {
    updateSettings.mutate(next, {
      onError: () => {
        console.warn('[PartySettings] Could not save settings. Please try again.')
      },
    })
  }

  // ---------------------------------------------------------------------------
  // Spotify connect handler (placeholder - Phase 9c)
  // ---------------------------------------------------------------------------
  function handleConnectSpotify() {
    setIsSpotifyAuthInProgress(true)
    console.warn('[PartySettings] Spotify OAuth not yet wired. Deferred to Phase 9c.')
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4">
      {/* Live region for screen reader announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        id="settings-live-region"
      />

      {/* General Settings panel */}
      <div className="flex-1">
        <GeneralSettingsPanel
          partyName={party.name}
          settings={settings}
          isSaving={updateSettings.isPending}
          flushButtonRef={flushButtonRef}
          isFlushPending={flushQueue.isPending}
          onSave={handleSave}
          onSaveName={(name) => {
            updateName.mutate(name, {
              onError: () => {
                console.warn(
                  '[PartySettings] Could not save party name. Please try again.',
                )
              },
            })
          }}
          onFlush={() => {
            flushQueue.mutate(undefined, {
              onSuccess: () => {
                console.warn('[PartySettings] Queue flushed successfully.')
              },
              onError: () => {
                console.warn(
                  '[PartySettings] Could not flush the queue. Please try again.',
                )
              },
            })
          }}
        />
      </div>

      {/* Fallback Playlist panel */}
      <div className="flex-1">
        <PlaylistPanel
          isSpotifyConnected={isSpotifyConnected}
          isSpotifyAuthInProgress={isSpotifyAuthInProgress}
          playlists={playlists ?? []}
          isPlaylistsLoading={playlistsLoading}
          isInsertPending={insertPlaylist.isPending}
          playlistFilter={playlistFilter}
          onFilterChange={setPlaylistFilter}
          onConnectSpotify={handleConnectSpotify}
          onInsertPlaylist={(playlistRef, shuffle) => {
            insertPlaylist.mutate(
              { playlistRef, shuffle },
              {
                onError: () => {
                  console.warn(
                    '[PartySettings] Could not insert playlist. Please try again.',
                  )
                },
              },
            )
          }}
        />
      </div>
    </div>
  )
}
