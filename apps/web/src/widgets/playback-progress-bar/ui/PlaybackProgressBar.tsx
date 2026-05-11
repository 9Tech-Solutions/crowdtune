import { useEffect, useRef } from 'react'

import type { Playback } from '@/entities/party'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlaybackProgressBarProps = {
  /** Live playback state from the party entity, or null when not available. */
  playback: Playback | null
  /** Full track duration in milliseconds. Null/zero/negative means no data. */
  durationMs: number | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeDisplayedPositionMs(playback: Playback): number {
  if (!playback.playing) return playback.lastPositionMs

  const lastChangeMs = new Date(playback.lastChange).getTime()
  const elapsed = Date.now() - lastChangeMs
  return playback.lastPositionMs + elapsed
}

function clampPercent(raw: number): number {
  return Math.min(1, Math.max(0, raw))
}

function isValidDuration(ms: number | null): ms is number {
  return ms !== null && ms > 0
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlaybackProgressBar({ playback, durationMs }: PlaybackProgressBarProps) {
  // Refs for direct DOM writes - bypass React reconciliation for frame-accurate
  // CSS transition sequencing and sub-second ARIA updates.
  const hostRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)

  // -----------------------------------------------------------------------
  // Coarse ARIA interval - updates aria-valuenow at most once per second.
  // Written via setAttribute to avoid triggering React reconciliation.
  // -----------------------------------------------------------------------

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const valid = isValidDuration(durationMs) && playback !== null

    if (!valid) {
      host.removeAttribute('aria-valuenow')
      return
    }

    function updateAria() {
      if (!host || !isValidDuration(durationMs) || playback === null) return
      const posMs = computeDisplayedPositionMs(playback)
      const rounded = Math.round(clampPercent(posMs / durationMs) * 100)
      host.setAttribute('aria-valuenow', String(rounded))
    }

    updateAria()

    if (!playback.playing) return

    const id = setInterval(updateAria, 1000)
    return () => clearInterval(id)
  }, [playback, durationMs])

  // -----------------------------------------------------------------------
  // Two-frame RAF animation sequence
  // -----------------------------------------------------------------------

  useEffect(() => {
    const fill = fillRef.current
    if (!fill) return

    const valid = isValidDuration(durationMs) && playback !== null

    if (!valid) {
      fill.style.transition = 'none'
      fill.style.transform = 'scaleX(0)'
      fill.style.opacity = '0'
      return
    }

    if (!playback.playing) {
      const pct = clampPercent(playback.lastPositionMs / durationMs)
      fill.style.transition = 'none'
      fill.style.transform = `scaleX(${pct})`
      fill.style.opacity = '0.5'
      return
    }

    // Playing path: two-frame RAF sequence.
    let frame1 = 0
    let frame2 = 0

    frame1 = requestAnimationFrame(() => {
      const displayedPositionMs = computeDisplayedPositionMs(playback)
      const currentPct = clampPercent(displayedPositionMs / durationMs)

      // Frame 1: anchor at current position with zero-duration transition.
      fill.style.transition = 'none'
      fill.style.transform = `scaleX(${currentPct})`
      fill.style.opacity = '1'

      frame2 = requestAnimationFrame(() => {
        const remainingMs = Math.max(0, durationMs - displayedPositionMs)

        // Frame 2: start a linear transition over the remaining track duration.
        fill.style.transition = `transform ${remainingMs}ms linear`
        fill.style.transform = 'scaleX(1)'
      })
    })

    return () => {
      cancelAnimationFrame(frame1)
      cancelAnimationFrame(frame2)
    }
  }, [playback, durationMs])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div
      ref={hostRef}
      role="progressbar"
      aria-label="Track playback progress"
      aria-valuemin={0}
      aria-valuemax={100}
      className="w-full h-px overflow-hidden"
    >
      <div
        ref={fillRef}
        className="h-full w-full bg-foreground"
        style={{
          transform: 'scaleX(0)',
          transformOrigin: 'left center',
          opacity: 0,
        }}
      />
    </div>
  )
}
