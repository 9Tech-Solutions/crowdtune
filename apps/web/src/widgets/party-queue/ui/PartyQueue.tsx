import { useEffect, useRef } from 'react'
import { Spinner, Text } from '@heroui/react'

import type { Playback } from '@/entities/party'
import type { Track, Metadata, TrackReference } from '@/entities/track'
import { PartyTrackRow } from '@/entities/track'
import { trackIdentityKey } from '@/entities/track'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PartyQueueProps = {
  /** True once the initial queue fetch has completed (even if empty). */
  tracksLoaded: boolean
  /** True when the current user is the party host. */
  isOwner: boolean
  /** In-app path to the party settings sub-view. */
  settingsRoutePath: string
  /** Pre-sorted queue tracks. Index 0 is the currently-playing track. */
  tracks: Track[]
  /**
   * Display metadata keyed by trackIdentityKey(track).
   * Null values are allowed (metadata not yet loaded for that track).
   */
  metadata: Record<string, Metadata | null>
  /** The party's live playback state. */
  playback: Playback | null
  /**
   * Whether the current user has voted on each track.
   * Keyed by trackIdentityKey(track). Missing key = false.
   */
  votes: Record<string, boolean>
  /**
   * Whether a vote mutation is in-flight for each track.
   * Keyed by trackIdentityKey(track). Missing key = false.
   */
  pendingVotes: Record<string, boolean>
  /** Whether the current user is the Spotify playback master for this tab. */
  isPlaybackMaster: boolean
  /** Whether another device currently holds the playback master role. */
  hasOtherPlaybackMaster: boolean
  /** Whether the current user has a Spotify account connected. */
  hasConnectedSpotify: boolean
  /** Whether the current device supports the Spotify Web Playback SDK. */
  isCompatible: boolean
  /** Whether the party's Spotify playback is currently active (not paused). */
  isMusicPlaying: boolean
  /** True while a play/pause toggle request is in flight. */
  isTogglingPlayback: boolean
  /** Pre-computed play-button enabled flag (four-condition AND). */
  isPlayButtonEnabled: boolean
  /** Called when the user taps the vote button on any row. */
  onVote: (ref: TrackReference, newVote: boolean) => void
  /** Called when the host taps the remove/skip button on any row. */
  onRemove: (ref: TrackReference) => void
  /** Called when the host taps the play/pause button on the playing row. */
  onTogglePlayback: () => void
  /** Called when the host taps the transfer-playback button. */
  onTransferPlayback: () => void
  /** Called when the user taps the settings link in the host empty-state. */
  onNavigate: (path: string) => void
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

function HostEmptyState({
  settingsRoutePath,
  onNavigate,
}: {
  settingsRoutePath: string
  onNavigate: (path: string) => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-12 text-center">
      <Text type="h2" align="center">
        The queue is empty
      </Text>
      <Text type="body-sm" color="muted" align="center">
        Add a fallback playlist so music keeps playing.{' '}
        {/*
          Spec section 7: "render the link as a TanStack Router Link component
          (or a plain anchor)". Using a plain anchor preserves keyboard and
          browser navigation affordances. onPress on HeroUI Link fires a
          PressEvent without preventDefault; using onClick on <a> is cleaner.
        */}
        <a
          href={settingsRoutePath}
          className="link"
          onClick={(e) => {
            e.preventDefault()
            onNavigate(settingsRoutePath)
          }}
        >
          Go to settings
        </a>
      </Text>
    </div>
  )
}

function GuestEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-12 text-center">
      <Text type="h2" align="center">
        The queue is empty
      </Text>
      <Text type="body-sm" color="muted" align="center">
        Search for your favourite tracks and add them to the queue.
      </Text>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Animation helper - View Transitions API progressive enhancement
// ---------------------------------------------------------------------------

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function supportsViewTransitions(): boolean {
  return 'startViewTransition' in document
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PartyQueue({
  tracksLoaded,
  isOwner,
  settingsRoutePath,
  tracks,
  metadata,
  playback,
  votes,
  pendingVotes,
  isPlaybackMaster,
  hasOtherPlaybackMaster,
  hasConnectedSpotify,
  isCompatible,
  isMusicPlaying,
  isTogglingPlayback,
  isPlayButtonEnabled,
  onVote,
  onRemove,
  onTogglePlayback,
  onTransferPlayback,
  onNavigate,
}: PartyQueueProps) {
  // Stable reference to the sorted track-identity sequence for transition detection.
  const prevOrderRef = useRef<string>('')

  useEffect(() => {
    const nextOrder = tracks.map(trackIdentityKey).join(',')
    const prevOrder = prevOrderRef.current

    // Skip on first mount (prevOrder is empty) and when no reorder happened.
    if (prevOrder === '' || prevOrder === nextOrder) {
      prevOrderRef.current = nextOrder
      return
    }

    prevOrderRef.current = nextOrder

    if (prefersReducedMotion() || !supportsViewTransitions()) return

    // The state update already happened; startViewTransition animates the DOM diff.
    document.startViewTransition(() => {
      // No DOM mutation needed here - React has already committed the new order.
      // The View Transitions API captures before/after screenshots automatically.
    })
  }, [tracks])

  // -- Loading state ---------------------------------------------------------
  if (!tracksLoaded) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="lg" />
      </div>
    )
  }

  // -- Empty state -----------------------------------------------------------
  if (tracks.length === 0) {
    return isOwner ? (
      <HostEmptyState settingsRoutePath={settingsRoutePath} onNavigate={onNavigate} />
    ) : (
      <GuestEmptyState />
    )
  }

  // -- Populated queue -------------------------------------------------------
  const currentTrack = tracks[0] ?? null

  return (
    <ul className="list-none m-0 p-0">
      {tracks.map((track, index) => {
        const key = trackIdentityKey(track)
        const rowMetadata = metadata[key] ?? null
        const hasVoted = votes[key] ?? false
        const isVotePending = pendingVotes[key] ?? false

        return (
          <li key={key}>
            <PartyTrackRow
              track={track}
              metadata={rowMetadata}
              currentTrack={currentTrack}
              playback={playback}
              isPlaying={index === 0}
              hasPlayingRowAbove={index === 1 && tracks.length > 1}
              isEvenRow={index % 2 === 1}
              hasVoted={hasVoted}
              isOwner={isOwner}
              isMusicPlaying={isMusicPlaying}
              isPlaybackMaster={isPlaybackMaster}
              hasOtherPlaybackMaster={hasOtherPlaybackMaster}
              hasConnectedSpotify={hasConnectedSpotify}
              isCompatible={isCompatible}
              isTogglingPlayback={isTogglingPlayback}
              isPlayButtonEnabled={isPlayButtonEnabled}
              isVotePending={isVotePending}
              onVote={onVote}
              onRemove={onRemove}
              onTogglePlayback={onTogglePlayback}
              onTransferPlayback={onTransferPlayback}
              onSkip={onRemove}
            />
          </li>
        )
      })}
    </ul>
  )
}
