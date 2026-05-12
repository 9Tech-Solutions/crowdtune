import { Avatar, Button, Spinner } from '@heroui/react'
import type { Metadata, TrackReference } from '@/entities/track'
import { formatArtists, pickCoverUrl } from '@/entities/track'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchResultRowProps = {
  /** Display metadata from the streaming provider. Null while loading. */
  metadata: Metadata | null
  /** Identifies the track for the add mutation. */
  trackRef: TrackReference
  /** Current queue vote count. Zero when the track is not queued. */
  voteCount: number
  /** True when the track already appears in the party queue snapshot. */
  isAlreadyQueued: boolean
  /** True while the add mutation is in flight for this track. */
  isAddPending: boolean
  /** Called with the track reference when the add button is tapped. */
  onAdd: (ref: TrackReference) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchResultRow({
  metadata,
  trackRef,
  voteCount,
  isAlreadyQueued,
  isAddPending,
  onAdd,
}: SearchResultRowProps) {
  const title = metadata?.title ?? null
  const artistString = formatArtists(metadata)
  const coverUrl = metadata ? pickCoverUrl(metadata.coverImages, 54) : undefined

  const displayTitle = title ?? 'Loading track'
  const displayArtist = artistString ?? ''

  const addButtonLabel = isAddPending
    ? `Adding ${displayTitle}...`
    : isAlreadyQueued
      ? `${voteCount} vote${voteCount !== 1 ? 's' : ''} - already queued`
      : `Add ${displayTitle}${displayArtist ? ` by ${displayArtist}` : ''} to queue`

  const rowAriaLabel =
    metadata != null
      ? `${displayTitle}${displayArtist ? ` by ${displayArtist}` : ''}`
      : 'Loading track'

  return (
    <div
      className="flex items-center gap-3 px-4 py-2"
      aria-label={rowAriaLabel}
    >
      {/* Cover image */}
      <Avatar
        size="md"
        className="shrink-0 size-[54px] rounded-md"
        variant={coverUrl ? 'default' : 'soft'}
      >
        {coverUrl ? (
          <Avatar.Image src={coverUrl} alt={displayTitle} />
        ) : (
          <Avatar.Fallback color="default" />
        )}
      </Avatar>

      {/* Metadata */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium leading-tight">{displayTitle}</p>
        {displayArtist && (
          <p className="truncate text-xs text-default-500 leading-tight">{displayArtist}</p>
        )}
      </div>

      {/* Add button */}
      <div className="shrink-0">
        {isAddPending ? (
          <Button
            variant="ghost"
            size="md"
            isDisabled
            aria-label={addButtonLabel}
          >
            <Spinner size="sm" color="current" />
            Adding...
          </Button>
        ) : isAlreadyQueued ? (
          <Button
            variant="ghost"
            size="sm"
            isDisabled
            aria-label={addButtonLabel}
          >
            {voteCount} vote{voteCount !== 1 ? 's' : ''}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            aria-label={addButtonLabel}
            onPress={() => onAdd(trackRef)}
          >
            Add
          </Button>
        )}
      </div>
    </div>
  )
}
