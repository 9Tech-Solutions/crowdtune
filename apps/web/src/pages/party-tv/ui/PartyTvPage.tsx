import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { Spinner } from '@heroui/react'

import { TvTrackCard } from '@/entities/track'
import type { Track, Metadata } from '@/entities/track'
import { trackIdentityKey, formatArtists, pickCoverUrl } from '@/entities/track'
import type { Playback } from '@/entities/party'
import { PlaybackProgressBar } from '@/widgets/playback-progress-bar'
import { usePartyQuery } from '@/pages/party/api/use-party-query'
import { usePlaybackQuery } from '@/pages/party/api/use-playback-query'
import { useTvQueueQuery } from '../api/use-tv-queue-query'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Deterministic background image index per spec section 4.6. */
function bgImageIndex(trackName: string, imageCount: number): number {
  return trackName.length % imageCount
}

// ---------------------------------------------------------------------------
// Loading panel
// ---------------------------------------------------------------------------

function LoadingPanel() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading TV mode"
      className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-black"
    >
      <p className="text-7xl font-bold text-white tracking-tight">CrowdTune</p>
      <Spinner size="xl" color="current" className="text-white" />
      <p className="text-white/70 text-lg">Loading...</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Error panel
// ---------------------------------------------------------------------------

type ErrorPanelProps = { message: string }

function ErrorPanel({ message }: ErrorPanelProps) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-black">
      {/* copy review: error copy below */}
      <span className="text-[12vh]" role="img" aria-label="Error">
        &#x26A1;
      </span>
      <p className="text-[7vh] text-white font-bold">Party unavailable</p>
      <p className="text-white/70 text-base">{message}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty queue panel
// ---------------------------------------------------------------------------

type EmptyPanelProps = { tvDisplayText: string }

function EmptyPanel({ tvDisplayText }: EmptyPanelProps) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-black">
      <p className="text-7xl font-bold text-white tracking-tight">CrowdTune</p>
      {/* copy review: empty queue heading below */}
      <p className="text-[7vh] text-white font-bold">Queue is empty</p>
      {tvDisplayText && (
        <p className="text-white/70 text-lg text-center max-w-lg">{tvDisplayText}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Background image (Ken Burns or cover-art fallback)
// ---------------------------------------------------------------------------

type BackgroundProps = {
  backgroundImages: string[]
  coverArtUrl: string | undefined
  trackName: string
}

function TvBackground({ backgroundImages, coverArtUrl, trackName }: BackgroundProps) {
  const hasBackgrounds = backgroundImages.length > 0
  const reduced = prefersReducedMotion()

  const imgUrl = hasBackgrounds
    ? backgroundImages[bgImageIndex(trackName, backgroundImages.length)]
    : coverArtUrl

  if (!imgUrl) return null

  return (
    <img
      src={imgUrl}
      alt=""
      aria-hidden="true"
      className={[
        'absolute inset-0 w-full h-full object-cover opacity-30 blur-md pointer-events-none select-none',
        hasBackgrounds && !reduced ? 'tv-ken-burns' : '',
      ]
        .join(' ')
        .trim()}
    />
  )
}

// ---------------------------------------------------------------------------
// Populated layout
// ---------------------------------------------------------------------------

type PopulatedProps = {
  tracks: Track[]
  metadataByKey: Record<string, Metadata>
  partyId: string
  tvDisplayText: string
  playback: Playback | null
}

function PopulatedLayout({
  tracks,
  metadataByKey,
  partyId,
  tvDisplayText,
  playback,
}: PopulatedProps) {
  const nowPlayingTrack = tracks[0]!
  const nowPlayingKey = trackIdentityKey(nowPlayingTrack.ref)
  const nowPlayingMeta = metadataByKey[nowPlayingKey] ?? null

  const coverUrl = nowPlayingMeta ? pickCoverUrl(nowPlayingMeta.coverImages, 980) : undefined
  const backgroundImages = nowPlayingMeta?.backgroundImages ?? []
  const trackName = nowPlayingMeta?.title ?? ''
  const artistString = formatArtists(nowPlayingMeta) ?? ''

  // Upcoming tracks: indices 1..29 (max 29 cards)
  const upcomingTracks = tracks.slice(1, 30)

  const reduced = prefersReducedMotion()

  return (
    // Root: fixed, full-viewport, overflow hidden, no chrome
    <div
      className="fixed inset-0 overflow-hidden bg-black"
      style={{ fontSize: '5.3vh' }}
    >
      {/* Background layer */}
      <TvBackground
        backgroundImages={backgroundImages}
        coverArtUrl={coverUrl}
        trackName={trackName}
      />

      {/* Content sits above the background */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Upper region: ~70vh */}
        <div className="flex-1 flex items-center px-[4vh]">
          {/* Now-playing region */}
          <section
            role="region"
            aria-label="Now playing"
            className="flex flex-row items-center"
          >
            {/* Cover art */}
            <div className="w-[49vh] h-[49vh] shadow-2xl flex-shrink-0">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={trackName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-white/10" role="img" aria-label={trackName} />
              )}
            </div>

            {/* Metadata block */}
            <div className="ml-[8vh] flex flex-col gap-[1vh] min-w-0">
              <p className="text-[1em] font-normal text-white truncate">{trackName}</p>
              <p className="text-[1em] font-thin text-white truncate">{artistString}</p>

              {/* Progress bar strip.
                  durationMs left null because per-track metadata's durationMs
                  is not yet threaded; the bar renders an invisible 0% strip
                  until the backend lands (same pattern as PartyPage). */}
              <div className="my-[4vh] h-[0.6vh]">
                <PlaybackProgressBar playback={playback} durationMs={null} />
              </div>

              {/* TV mode text */}
              {tvDisplayText && (
                <p className="text-[0.7em] text-white/80 truncate">{tvDisplayText}</p>
              )}

              {/* Join code pill */}
              <span className="inline-block bg-white/20 text-white rounded-full px-3 py-1 text-[0.6em] self-start">
                {partyId}
              </span>
            </div>
          </section>
        </div>

        {/* Lower region: ~29vh, queue strip */}
        <div className="h-[29vh] flex-shrink-0 flex flex-row gap-0 overflow-hidden px-[2vh]">
          <ul role="list" className="flex flex-row gap-[2vh]">
            {upcomingTracks.map((track) => {
              const key = trackIdentityKey(track.ref)
              const meta = metadataByKey[key] ?? null
              const transitionStyle =
                !reduced && typeof document !== 'undefined' && 'startViewTransition' in document
                  ? { viewTransitionName: `tv-row-${key}` }
                  : undefined

              return (
                <TvTrackCard
                  key={key}
                  trackRef={track.ref}
                  track={track}
                  metadata={meta}
                  style={transitionStyle}
                />
              )
            })}
          </ul>
        </div>
      </div>

      {/* Aria-live region for now-playing transitions (screen reader). */}
      {/* off-screen, polite, only content changes cause announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {trackName && artistString
          ? `Now playing: ${trackName} by ${artistString}`
          : trackName
            ? `Now playing: ${trackName}`
            : ''}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PartyTvPage
// ---------------------------------------------------------------------------

export function PartyTvPage() {
  const { partyId } = useParams({ from: '/party/$partyId/tv' })
  const navigate = useNavigate()

  // Server state
  const { data: party, isLoading: partyLoading, error: partyError } = usePartyQuery(partyId)
  const { data: playback } = usePlaybackQuery(partyId)
  const { tracks, metadataByKey, isLoading: queueLoading } = useTvQueueQuery(partyId)

  // Cursor auto-hide state (spec section 4.5)
  const [cursorVisible, setCursorVisible] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function showCursor() {
      setCursorVisible(true)
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
      hideTimerRef.current = setTimeout(() => {
        setCursorVisible(false)
      }, 3000)
    }

    window.addEventListener('mousemove', showCursor)

    return () => {
      window.removeEventListener('mousemove', showCursor)
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current)
    }
  }, [])

  // Escape key: navigate back to party (OQ-8 lock)
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        void navigate({ to: '/party/$partyId', params: { partyId } })
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [navigate, partyId])

  // Derive the currently-playing track's metadata key
  const nowPlayingTrack = tracks[0] ?? null
  const nowPlayingKey = nowPlayingTrack ? trackIdentityKey(nowPlayingTrack.ref) : null
  const nowPlayingMeta = nowPlayingKey ? (metadataByKey[nowPlayingKey] ?? null) : null

  // Render state: loading
  const isLoading =
    partyLoading ||
    queueLoading ||
    (tracks.length > 0 && nowPlayingMeta === null)

  // Render state: error
  if (partyError) {
    return (
      <div className={cursorVisible ? 'cursor-auto' : 'cursor-none'}>
        <ErrorPanel message={partyError.message} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={cursorVisible ? 'cursor-auto' : 'cursor-none'}>
        <LoadingPanel />
      </div>
    )
  }

  // Render state: empty queue
  if (tracks.length === 0) {
    const tvDisplayText = party?.settings?.tvDisplayText ?? ''
    return (
      <div className={cursorVisible ? 'cursor-auto' : 'cursor-none'}>
        <EmptyPanel tvDisplayText={tvDisplayText} />
      </div>
    )
  }

  // Render state: populated
  const tvDisplayText = party?.settings?.tvDisplayText ?? ''

  return (
    <div className={cursorVisible ? 'cursor-auto' : 'cursor-none'}>
      <PopulatedLayout
        tracks={tracks}
        metadataByKey={metadataByKey}
        partyId={partyId}
        tvDisplayText={tvDisplayText}
        playback={playback ?? null}
      />
    </div>
  )
}
