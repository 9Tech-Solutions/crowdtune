import { Avatar, Button, Spinner } from '@heroui/react'

import type { Playback } from '@/entities/party'
import type { Image } from '@/shared/model'

import type { Track, TrackReference, Metadata } from '../model/types'
import { formatArtists, voteStatusLabel } from '../lib/labels'

// -------------------------------------------------------------------------
// Props
// -------------------------------------------------------------------------

export type PartyTrackRowProps = {
  /** The queue entry. Null if removed between list render and row mount. */
  track: Track | null
  /** Display metadata. Null while the metadata fetch is in flight. */
  metadata: Metadata | null
  /** The party's current head-of-queue track, for voteStatusLabel. */
  currentTrack: Track | null
  /** Live playback state, for voteStatusLabel and play/pause icon. */
  playback: Playback | null
  /** Whether this row is the currently-playing track. */
  isPlaying: boolean
  /** Whether the authenticated user has already voted for this track. */
  hasVoted: boolean
  /** Whether the authenticated user is the party host. */
  isOwner: boolean
  /** Whether the party's Spotify playback is currently active (not paused). */
  isMusicPlaying: boolean
  /** Whether this browser tab is the designated audio-output controller. */
  isPlaybackMaster: boolean
  /** Whether another device holds the master role right now. */
  hasOtherPlaybackMaster: boolean
  /** Whether the current user has a Spotify account connected. */
  hasConnectedSpotify: boolean
  /** Whether the current browser/device supports the Spotify Web Playback SDK. */
  isCompatible: boolean
  /** True while a play/pause toggle request is in flight. */
  isTogglingPlayback: boolean
  /**
   * Pre-computed "play button enabled" flag (the four-condition AND from
   * spec section 3). Parent computes it so it stays testable in isolation.
   */
  isPlayButtonEnabled: boolean
  /** True while the vote mutation is in flight. Disables the vote button. */
  isVotePending: boolean
  /**
   * When true, applies extra top padding to create a visual gap from the
   * currently-playing row directly above this one (index 1 in the queue).
   * Defaults to false.
   */
  hasPlayingRowAbove?: boolean
  /**
   * When true, applies a subtle alternating stripe background.
   * The queue passes this for rows at even DOM indices (1, 3, 5, …).
   * Defaults to false.
   */
  isEvenRow?: boolean
  /** Called with the track reference and the new desired vote state. */
  onVote: (ref: TrackReference, newVote: boolean) => void
  /** Called to remove this track from the queue. */
  onRemove: (ref: TrackReference) => void
  /** Called to toggle party playback (play ↔ pause). */
  onTogglePlayback: () => void
  /** Called to transfer audio master to this device. */
  onTransferPlayback: () => void
  /** Called to skip the currently-playing track (advance queue). */
  onSkip: (ref: TrackReference) => void
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/** Pick the best image URL for a fixed rendered size of 54 px. */
function pickCoverUrl(images: Image[]): string | undefined {
  if (images.length === 0) return undefined
  // Provider orders largest first; find the smallest image >= 54px or fall
  // back to the last (smallest) if none qualifies.
  const best = [...images].reverse().find((img) => img.width >= 54)
  return (best ?? images[images.length - 1]).url
}

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export function PartyTrackRow({
  track,
  metadata,
  currentTrack,
  playback,
  isPlaying,
  hasVoted,
  isOwner,
  isMusicPlaying,
  isPlaybackMaster,
  hasOtherPlaybackMaster,
  hasConnectedSpotify,
  isCompatible,
  isTogglingPlayback,
  isPlayButtonEnabled,
  isVotePending,
  hasPlayingRowAbove = false,
  isEvenRow = false,
  onVote,
  onRemove,
  onTogglePlayback,
  onTransferPlayback,
  onSkip,
}: PartyTrackRowProps) {
  // Inline derived data - per spec, called here rather than pre-computed by parent
  const artistString = formatArtists(metadata)
  const statusLabel = voteStatusLabel({ track, currentTrack, playback })

  const title = metadata?.title ?? 'Loading...'
  const coverUrl = metadata ? pickCoverUrl(metadata.coverImages) : undefined

  // Vote button icon state (spec section 3 trailing-actions)
  const showFilledHeart = hasVoted
  const showOutlinedHeart = !hasVoted && (track != null && (track.voteCount > 0 || track.isFallback))
  // otherwise show plus icon

  // Show remove on non-playing rows when host + track has engagement
  const showRemove =
    isOwner && !isPlaying && track != null && (track.voteCount > 0 || track.isFallback)

  // Transfer button visibility (spec section 3)
  const showTransfer =
    isPlaying &&
    isOwner &&
    !isPlaybackMaster &&
    hasOtherPlaybackMaster &&
    isCompatible &&
    hasConnectedSpotify

  // Skip button visibility (spec section 3)
  const showSkip = isPlaying && isOwner && track != null

  // Row background: playing row gets content2 chip; even rows get a subtle stripe.
  // hasPlayingRowAbove adds extra top padding for the visual gap after the playing row.
  const rowClass = [
    'flex items-center gap-3 px-4',
    isPlaying ? 'py-4 bg-content2 rounded-lg' : 'py-2',
    !isPlaying && isEvenRow ? 'bg-default' : '',
    hasPlayingRowAbove ? 'mt-2' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rowClass}>
      {/* Leading visual: cover image or placeholder */}
      <Avatar
        size="md"
        className="shrink-0 size-[54px] rounded-md"
        variant={coverUrl ? 'default' : 'soft'}
      >
        {coverUrl ? (
          <Avatar.Image src={coverUrl} alt={title} />
        ) : (
          <Avatar.Fallback color="default" />
        )}
      </Avatar>

      {/* Metadata block */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium leading-tight">{title}</p>
        {artistString != null && (
          <p className="truncate text-xs text-default-500 leading-tight">
            {artistString}
            {statusLabel ? ` · ${statusLabel}` : null}
          </p>
        )}
      </div>

      {/* Trailing actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Play/pause button (currently-playing row, host only) */}
        {isPlaying && isOwner && (
          <div className="relative">
            <Button
              variant="primary"
              size="md"
              isIconOnly
              isDisabled={!isPlayButtonEnabled}
              aria-label={isMusicPlaying ? 'Pause' : 'Play'}
              onPress={onTogglePlayback}
            >
              {isMusicPlaying ? <PauseIcon /> : <PlayIcon />}
            </Button>
            {isTogglingPlayback && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Spinner size="sm" color="current" />
              </span>
            )}
          </div>
        )}

        {/* Skip button (host, currently-playing, track non-null) */}
        {showSkip && (
          <Button
            variant="ghost"
            size="md"
            isIconOnly
            isDisabled={isTogglingPlayback}
            aria-label={`Skip ${title}`}
            onPress={() => onSkip(track!.ref)}
          >
            <SkipIcon />
          </Button>
        )}

        {/* Transfer playback button */}
        {showTransfer && (
          <Button
            variant="ghost"
            size="md"
            isIconOnly
            aria-label="Transfer playback to this device"
            onPress={onTransferPlayback}
          >
            <TransferIcon />
          </Button>
        )}

        {/* Vote button (non-playing rows only; hidden when track record is null) */}
        {!isPlaying && track != null && (
          <Button
            variant="ghost"
            size="md"
            isIconOnly
            isDisabled={isVotePending}
            aria-label={hasVoted ? `Unvote ${title}` : `Vote for ${title}`}
            onPress={() => onVote(track.ref, !hasVoted)}
          >
            {showFilledHeart ? (
              <HeartFilledIcon />
            ) : showOutlinedHeart ? (
              <HeartOutlineIcon />
            ) : (
              <PlusIcon />
            )}
          </Button>
        )}

        {/* Remove button (host, non-playing, track with engagement) */}
        {showRemove && (
          <Button
            variant="ghost"
            size="md"
            isIconOnly
            aria-label={`Remove ${title}`}
            onPress={() => onRemove(track!.ref)}
          >
            <RemoveIcon />
          </Button>
        )}
      </div>
    </div>
  )
}

// -------------------------------------------------------------------------
// Inline SVG icon primitives
// HeroUI v3 does not ship an icon set; these are minimal 24x24 SVGs that
// match the spec's icon semantics without pulling in a third-party icon
// library. They are intentionally thin wrappers - no styling, no props.
// -------------------------------------------------------------------------

function PlayIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  )
}

function SkipIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z" />
    </svg>
  )
}

function TransferIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M17 12h-5v5h5v-5zm-1-9v1H8V3H6v1H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-1V3h-2zm3 18H5V9h14v12z" />
    </svg>
  )
}

function HeartFilledIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  )
}

function HeartOutlineIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  )
}

function RemoveIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  )
}
