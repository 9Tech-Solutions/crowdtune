import type { CSSProperties } from 'react'

import type { Track, TrackReference, Metadata } from '../model/types'
import { formatArtists } from '../lib/labels'
import { pickCoverUrl } from '../lib/cover'

// -------------------------------------------------------------------------
// Props
// -------------------------------------------------------------------------

export type TvTrackCardProps = {
  /**
   * Provider identity. Used only as a React key hint by the parent list;
   * the component does not perform any state lookups from it.
   * Required to maintain the established track-component shape across
   * all CrowdTune entity/track UI components.
   */
  trackRef: TrackReference

  /** Queue entry - vote count source. Null if not yet loaded. */
  track: Track | null

  /** Display metadata - title, artists, coverImages. Null while fetching. */
  metadata: Metadata | null

  /**
   * Inline style applied to the root list item. Used by parents that need
   * to attach view-transition-name (or similar per-element CSS) without
   * inserting an intermediate wrapper element that would break the
   * ul/li ARIA list semantics.
   */
  style?: CSSProperties
}

// -------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------

export function TvTrackCard({ track, metadata, style }: TvTrackCardProps) {
  // All display values are derived from the controlled props.
  const voteCount = track?.voteCount ?? 0
  const title = metadata?.title ?? 'Loading...'
  const artistString = formatArtists(metadata)
  const coverUrl = metadata ? pickCoverUrl(metadata.coverImages, 200) : undefined

  // Alt text: descriptive when loaded, empty when not (spec section 9).
  // Empty alt on the placeholder prevents screen readers from announcing
  // "Loading..." which would be misleading on a passive ambient display.
  const coverAlt = metadata?.title ?? ''

  return (
    // role="listitem" matches the parent TV view's role="list" strip.
    // The tile has no interactive elements so no focus management is needed.
    <li role="listitem" style={style} className="w-52 flex flex-col">
      {/* Cover area - square, dominant, large drop shadow */}
      <div className="relative aspect-square w-52 shadow-2xl">
        {coverUrl ? (
          // Plain <img> used instead of HeroUI Avatar because Avatar.Image
          // defers rendering until the image loads (async), which makes it
          // untestable in jsdom. The spec section 7 explicitly permits a bare
          // <img> when it handles object-cover cleanly.
          <img
            src={coverUrl}
            alt={coverAlt}
            className="object-cover w-full h-full"
          />
        ) : (
          // Placeholder block - neutral background, same dimensions as cover
          <div
            className="w-full h-full bg-content1"
            role="img"
            aria-label={coverAlt}
          />
        )}

        {/* Dark overlay - always present so the vote count is always readable */}
        <div className="absolute inset-0 bg-black/60" />

        {/* Vote count overlay
            No aria-live here: TV mode is a passive ambient display, not a
            primary screen-reader surface. A future accessibility pass can add
            role="status" if venue operators request it. */}
        <div className="absolute inset-0 flex items-center justify-center text-6xl text-white font-bold drop-shadow-lg">
          {voteCount}
        </div>
      </div>

      {/* Track title */}
      <p className="mt-2 text-lg text-white truncate">{title}</p>

      {/* Artist line - only rendered when formatArtists returns a non-null string */}
      {artistString != null && (
        <p className="text-xs font-thin text-white truncate">{artistString}</p>
      )}
    </li>
  )
}
