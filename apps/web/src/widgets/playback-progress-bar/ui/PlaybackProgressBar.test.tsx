import { render, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import type { Playback } from '@/entities/party'
import { PlaybackProgressBar } from './PlaybackProgressBar'

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const BASE_TIME = 1_700_000_000_000 // fixed epoch for determinism

function makePlayback(overrides: Partial<Playback> = {}): Playback {
  return {
    lastChange: new Date(BASE_TIME).toISOString(),
    lastPositionMs: 0,
    masterId: null,
    playing: true,
    targetPlaying: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// rAF mock helpers
// ---------------------------------------------------------------------------

type RafCallback = (time: number) => void
let rafCallbacks: Map<number, RafCallback> = new Map()
let rafHandle = 0

function installSyncRaf() {
  rafCallbacks = new Map()
  rafHandle = 0

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    const id = ++rafHandle
    rafCallbacks.set(id, cb)
    return id
  })

  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    rafCallbacks.delete(id)
  })
}

function flushOneFrame() {
  const entries = [...rafCallbacks.entries()]
  if (entries.length === 0) return
  const [id, cb] = entries[0]
  rafCallbacks.delete(id)
  cb(performance.now())
}

function flushAllFrames() {
  while (rafCallbacks.size > 0) {
    flushOneFrame()
  }
}

function restoreRaf() {
  vi.mocked(window.requestAnimationFrame).mockRestore()
  vi.mocked(window.cancelAnimationFrame).mockRestore()
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASE_TIME)
  installSyncRaf()
})

afterEach(() => {
  vi.useRealTimers()
  restoreRaf()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// 1. Host element has role="progressbar" when given valid props
// ---------------------------------------------------------------------------

describe('1. progressbar role', () => {
  it('renders the host element with role="progressbar" given valid playback + duration', () => {
    const { container } = render(
      <PlaybackProgressBar playback={makePlayback()} durationMs={180_000} />,
    )
    const host = container.querySelector('[role="progressbar"]')
    expect(host).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. aria-valuenow reflects rounded percentage
// ---------------------------------------------------------------------------

describe('2. aria-valuenow reflects percentage', () => {
  it('reflects the rounded computed percentage after effect runs for a playing track', () => {
    // lastPositionMs 90_000 out of 180_000ms = exactly 50%; system time = BASE_TIME so elapsed = 0.
    const playback = makePlayback({ lastPositionMs: 90_000 })
    const { container } = render(
      <PlaybackProgressBar playback={playback} durationMs={180_000} />,
    )
    // The ARIA effect fires synchronously in jsdom after render.
    const host = container.querySelector('[role="progressbar"]')
    expect(host?.getAttribute('aria-valuenow')).toBe('50')
  })

  it('reflects the rounded percentage for a paused track', () => {
    // paused at 45_000ms out of 180_000ms = 25%
    const playback = makePlayback({ playing: false, lastPositionMs: 45_000 })
    const { container } = render(
      <PlaybackProgressBar playback={playback} durationMs={180_000} />,
    )
    const host = container.querySelector('[role="progressbar"]')
    expect(host?.getAttribute('aria-valuenow')).toBe('25')
  })
})

// ---------------------------------------------------------------------------
// 3. aria-valuenow omitted when playback is null
// ---------------------------------------------------------------------------

describe('3. aria-valuenow omitted when playback null', () => {
  it('does not set aria-valuenow when playback prop is null', () => {
    const { container } = render(
      <PlaybackProgressBar playback={null} durationMs={180_000} />,
    )
    const host = container.querySelector('[role="progressbar"]')
    expect(host?.hasAttribute('aria-valuenow')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. aria-valuenow omitted when durationMs is null or zero
// ---------------------------------------------------------------------------

describe('4. aria-valuenow omitted when duration invalid', () => {
  it('omits aria-valuenow when durationMs is null', () => {
    const { container } = render(
      <PlaybackProgressBar playback={makePlayback()} durationMs={null} />,
    )
    const host = container.querySelector('[role="progressbar"]')
    expect(host?.hasAttribute('aria-valuenow')).toBe(false)
  })

  it('omits aria-valuenow when durationMs is zero', () => {
    const { container } = render(
      <PlaybackProgressBar playback={makePlayback()} durationMs={0} />,
    )
    const host = container.querySelector('[role="progressbar"]')
    expect(host?.hasAttribute('aria-valuenow')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 5. Playing state: fill transform reflects computed percentage
// ---------------------------------------------------------------------------

describe('5. playing state fill transform', () => {
  it('after flushing both frames the fill scaleX is 1 (targeting 100%)', () => {
    const playback = makePlayback({ lastPositionMs: 0 })
    const { container } = render(
      <PlaybackProgressBar playback={playback} durationMs={180_000} />,
    )
    act(() => {
      flushAllFrames()
    })
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLDivElement
    // Frame 2 sets transform to scaleX(1) targeting 100%.
    expect(fill.style.transform).toBe('scaleX(1)')
  })

  it('after frame 1 only, fill scaleX is the computed current percentage', () => {
    // 90s elapsed since lastChange, track 180s: displayed = 90000ms / 180000ms = 0.5
    const playback = makePlayback({ lastPositionMs: 90_000 })
    const { container } = render(
      <PlaybackProgressBar playback={playback} durationMs={180_000} />,
    )
    act(() => {
      flushOneFrame() // only frame 1
    })
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLDivElement
    expect(fill.style.transform).toBe('scaleX(0.5)')
  })
})

// ---------------------------------------------------------------------------
// 6. Paused state: fill reflects lastPositionMs / durationMs with no transition
// ---------------------------------------------------------------------------

describe('6. paused state fill', () => {
  it('sets scaleX from lastPositionMs without animation frames', () => {
    const playback = makePlayback({ playing: false, lastPositionMs: 60_000 })
    const { container } = render(
      <PlaybackProgressBar playback={playback} durationMs={180_000} />,
    )
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLDivElement
    // Paused path is synchronous (no rAF needed).
    // 60000/180000 = 0.333...
    expect(fill.style.transform).toContain('scaleX(0.333')
    expect(fill.style.transition).toBe('none')
  })
})

// ---------------------------------------------------------------------------
// 7. Paused opacity: fill has reduced opacity when paused, full when playing
// ---------------------------------------------------------------------------

describe('7. paused opacity', () => {
  it('fill opacity is 0.5 when playback is paused', () => {
    const playback = makePlayback({ playing: false, lastPositionMs: 0 })
    const { container } = render(
      <PlaybackProgressBar playback={playback} durationMs={180_000} />,
    )
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLDivElement
    expect(fill.style.opacity).toBe('0.5')
  })

  it('fill opacity is 1 when playing (after frame 1)', () => {
    const playback = makePlayback({ playing: true, lastPositionMs: 0 })
    const { container } = render(
      <PlaybackProgressBar playback={playback} durationMs={180_000} />,
    )
    act(() => {
      flushOneFrame() // frame 1 sets opacity to 1
    })
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLDivElement
    expect(fill.style.opacity).toBe('1')
  })
})

// ---------------------------------------------------------------------------
// 8. Two-frame sequence runs on mount when playing
// ---------------------------------------------------------------------------

describe('8. two-frame sequence on mount', () => {
  it('requestAnimationFrame is called twice on mount when playing', () => {
    const rafSpy = vi.mocked(window.requestAnimationFrame)
    render(<PlaybackProgressBar playback={makePlayback()} durationMs={180_000} />)
    // First rAF is queued immediately by the animation effect.
    expect(rafSpy).toHaveBeenCalledTimes(1)

    act(() => {
      flushOneFrame() // frame 1 runs and queues frame 2
    })
    expect(rafSpy).toHaveBeenCalledTimes(2)
  })

  it('does NOT call requestAnimationFrame when paused', () => {
    const rafSpy = vi.mocked(window.requestAnimationFrame)
    render(
      <PlaybackProgressBar
        playback={makePlayback({ playing: false })}
        durationMs={180_000}
      />,
    )
    expect(rafSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 9. Cleanup on unmount cancels pending frames
// ---------------------------------------------------------------------------

describe('9. cleanup cancels pending frames', () => {
  it('cancelAnimationFrame is called for outstanding frames on unmount', () => {
    const cafSpy = vi.mocked(window.cancelAnimationFrame)
    const { unmount } = render(
      <PlaybackProgressBar playback={makePlayback()} durationMs={180_000} />,
    )
    // frame1 is queued but not yet flushed - unmount should cancel it.
    unmount()
    expect(cafSpy).toHaveBeenCalled()
  })

  it('no pending callbacks remain after unmount', () => {
    const { unmount } = render(
      <PlaybackProgressBar playback={makePlayback()} durationMs={180_000} />,
    )
    unmount()
    // After cleanup all rAF callbacks should be cancelled.
    expect(rafCallbacks.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 10. Re-anchor on prop change (new track)
// ---------------------------------------------------------------------------

describe('10. re-anchor on prop change', () => {
  it('re-runs the two-frame sequence when playback changes to a new track', () => {
    const rafSpy = vi.mocked(window.requestAnimationFrame)

    const playback1 = makePlayback({ lastPositionMs: 0 })
    const { rerender } = render(
      <PlaybackProgressBar playback={playback1} durationMs={180_000} />,
    )

    act(() => flushAllFrames()) // flush both frames for track 1
    const callsAfterMount = rafSpy.mock.calls.length

    // Simulate track switch: new lastChange timestamp and reset position.
    const playback2 = makePlayback({
      lastPositionMs: 0,
      lastChange: new Date(BASE_TIME + 200_000).toISOString(),
    })
    rerender(<PlaybackProgressBar playback={playback2} durationMs={240_000} />)

    // Effect re-runs: a new frame 1 should be queued.
    expect(rafSpy.mock.calls.length).toBeGreaterThan(callsAfterMount)
  })
})

// ---------------------------------------------------------------------------
// 11. Layout slot preserved when data absent
// ---------------------------------------------------------------------------

describe('11. layout slot preserved when data absent', () => {
  it('host element remains in the DOM when playback is null', () => {
    const { container } = render(
      <PlaybackProgressBar playback={null} durationMs={null} />,
    )
    const host = container.querySelector('[role="progressbar"]')
    expect(host).not.toBeNull()
  })

  it('host element has h-px class for the 1px height reservation', () => {
    const { container } = render(
      <PlaybackProgressBar playback={null} durationMs={null} />,
    )
    const host = container.querySelector('[role="progressbar"]')
    expect(host?.classList.contains('h-px')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 12. aria-valuenow throttle: does not update in the sub-1s window
// ---------------------------------------------------------------------------

describe('12. aria-valuenow throttle', () => {
  it('aria-valuenow does not change in the sub-1s window when playing', () => {
    const playback = makePlayback({ lastPositionMs: 0 })
    const { container } = render(
      <PlaybackProgressBar playback={playback} durationMs={180_000} />,
    )

    const host = container.querySelector('[role="progressbar"]') as HTMLElement
    const initialValue = host.getAttribute('aria-valuenow')

    // Advance time by 500ms (less than 1s throttle interval) without moving system time.
    act(() => {
      vi.advanceTimersByTime(500)
    })

    // The ARIA value should not have changed yet (interval not fired).
    expect(host.getAttribute('aria-valuenow')).toBe(initialValue)
  })

  it('aria-valuenow updates after the 1s interval fires', () => {
    const playback = makePlayback({ lastPositionMs: 0 })
    const { container } = render(
      <PlaybackProgressBar playback={playback} durationMs={180_000} />,
    )

    const host = container.querySelector('[role="progressbar"]') as HTMLElement
    const initialValue = host.getAttribute('aria-valuenow')

    // Move system clock forward so the interval callback computes a higher percentage.
    vi.setSystemTime(BASE_TIME + 10_000) // 10 seconds elapsed

    act(() => {
      vi.advanceTimersByTime(1000) // trigger the 1s interval
    })

    // After interval fires the value should have advanced from the initial.
    const updatedValue = host.getAttribute('aria-valuenow')
    expect(Number(updatedValue)).toBeGreaterThan(Number(initialValue))
  })
})
