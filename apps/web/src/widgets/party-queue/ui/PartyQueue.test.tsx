import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import type { Track, Metadata } from '@/entities/track'
import { trackIdentityKey } from '@/entities/track'
import type { Playback } from '@/entities/party'
import { PartyQueue, type PartyQueueProps } from './PartyQueue'

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeTrack(id: string, overrides: Partial<Track> = {}): Track {
  return {
    ref: { provider: 'spotify', id },
    addedAt: '2024-01-01T00:00:00Z',
    isFallback: false,
    voteCount: 0,
    order: 0,
    ...overrides,
  }
}

function makeMetadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    title: 'Track Title',
    artists: ['Artist Name'],
    coverImages: [],
    durationMs: 180_000,
    isPlayable: true,
    ...overrides,
  }
}

function makePlayback(playing = true): Playback {
  return {
    lastChange: '2024-01-01T00:00:00Z',
    lastPositionMs: 0,
    masterId: null,
    playing,
    targetPlaying: null,
  }
}

const TRACK_A = makeTrack('a')
const TRACK_B = makeTrack('b')
const TRACK_C = makeTrack('c')

function defaultProps(overrides: Partial<PartyQueueProps> = {}): PartyQueueProps {
  return {
    tracksLoaded: true,
    isOwner: false,
    settingsRoutePath: '/party/test/settings',
    tracks: [],
    metadata: {},
    playback: makePlayback(),
    votes: {},
    pendingVotes: {},
    isPlaybackMaster: false,
    hasOtherPlaybackMaster: false,
    hasConnectedSpotify: false,
    isCompatible: false,
    isMusicPlaying: false,
    isTogglingPlayback: false,
    isPlayButtonEnabled: false,
    onVote: vi.fn(),
    onRemove: vi.fn(),
    onTogglePlayback: vi.fn(),
    onTransferPlayback: vi.fn(),
    onNavigate: vi.fn(),
    ...overrides,
  }
}

function metadataFor(...tracks: Track[]): Record<string, Metadata> {
  // Call trackIdentityKey rather than hardcoding `spotify-${id}` so the test
  // tracks the production key format. If the production format changes, the
  // tests fail fast instead of silently passing with null-metadata rows.
  return Object.fromEntries(
    tracks.map((t) => [trackIdentityKey(t), makeMetadata({ title: `Title ${t.ref.id}` })]),
  )
}

// ---------------------------------------------------------------------------
// 1. Loading state
// ---------------------------------------------------------------------------

describe('loading state', () => {
  it('renders the spinner when tracksLoaded is false', () => {
    const { container } = render(<PartyQueue {...defaultProps({ tracksLoaded: false })} />)
    // HeroUI Spinner renders a <span data-slot="spinner"> with class "spinner".
    expect(container.querySelector('[data-slot="spinner"]')).not.toBeNull()
  })

  it('renders no track rows while loading', () => {
    const tracks = [TRACK_A, TRACK_B]
    render(
      <PartyQueue
        {...defaultProps({
          tracksLoaded: false,
          tracks,
          metadata: metadataFor(TRACK_A, TRACK_B),
        })}
      />,
    )
    expect(screen.queryByText('Title a')).not.toBeInTheDocument()
    expect(screen.queryByText('Title b')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 2. Empty state - host
// ---------------------------------------------------------------------------

describe('empty state (host)', () => {
  it('shows the primary heading', () => {
    render(<PartyQueue {...defaultProps({ isOwner: true, tracks: [] })} />)
    expect(screen.getByText(/the queue is empty/i)).toBeInTheDocument()
  })

  it('shows the "Go to settings" link', () => {
    render(<PartyQueue {...defaultProps({ isOwner: true, tracks: [] })} />)
    expect(screen.getByRole('link', { name: /go to settings/i })).toBeInTheDocument()
  })

  it('fires onNavigate with the settingsRoutePath when the link is tapped', async () => {
    const onNavigate = vi.fn()
    render(
      <PartyQueue
        {...defaultProps({ isOwner: true, tracks: [], onNavigate, settingsRoutePath: '/party/abc/settings' })}
      />,
    )
    await userEvent.click(screen.getByRole('link', { name: /go to settings/i }))
    expect(onNavigate).toHaveBeenCalledWith('/party/abc/settings')
  })
})

// ---------------------------------------------------------------------------
// 3. Empty state - guest
// ---------------------------------------------------------------------------

describe('empty state (guest)', () => {
  it('shows the primary heading', () => {
    render(<PartyQueue {...defaultProps({ isOwner: false, tracks: [] })} />)
    expect(screen.getByText(/the queue is empty/i)).toBeInTheDocument()
  })

  it('shows the search guidance message', () => {
    render(<PartyQueue {...defaultProps({ isOwner: false, tracks: [] })} />)
    expect(screen.getByText(/search for your favourite tracks/i)).toBeInTheDocument()
  })

  it('does not show a "Go to settings" link', () => {
    render(<PartyQueue {...defaultProps({ isOwner: false, tracks: [] })} />)
    expect(screen.queryByRole('link', { name: /go to settings/i })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 4. Populated state - row count and isPlaying assignment
// ---------------------------------------------------------------------------

describe('populated queue', () => {
  it('renders one row per track', () => {
    const tracks = [TRACK_A, TRACK_B, TRACK_C]
    render(<PartyQueue {...defaultProps({ tracks, metadata: metadataFor(...tracks) })} />)
    expect(screen.getByText('Title a')).toBeInTheDocument()
    expect(screen.getByText('Title b')).toBeInTheDocument()
    expect(screen.getByText('Title c')).toBeInTheDocument()
  })

  it('passes isPlaying true only to the first row', () => {
    // The play/pause button is only shown for the host on the playing row.
    // Use isOwner so it appears.
    const tracks = [TRACK_A, TRACK_B]
    render(
      <PartyQueue
        {...defaultProps({
          tracks,
          metadata: metadataFor(TRACK_A, TRACK_B),
          isOwner: true,
          isMusicPlaying: true,
          isPlayButtonEnabled: true,
        })}
      />,
    )
    // Pause button only appears on the currently-playing row (index 0).
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
    // Skip button appears for the playing row only.
    expect(screen.queryAllByRole('button', { name: /pause/i })).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 5. Callback forwarding
// ---------------------------------------------------------------------------

describe('callback forwarding', () => {
  it('calls onVote when the vote button on a non-playing row is tapped', async () => {
    const onVote = vi.fn()
    const tracks = [TRACK_A, TRACK_B]
    // isOwner false so vote button is visible on non-playing row
    render(
      <PartyQueue
        {...defaultProps({
          tracks,
          metadata: metadataFor(TRACK_A, TRACK_B),
          isOwner: false,
          onVote,
        })}
      />,
    )
    // Track B is at index 1 (non-playing), has vote button
    await userEvent.click(screen.getByRole('button', { name: /vote for Title b/i }))
    expect(onVote).toHaveBeenCalledWith(TRACK_B.ref, true)
  })
})

// ---------------------------------------------------------------------------
// 6. Alternating row backgrounds - isEvenRow at index 1
// ---------------------------------------------------------------------------

describe('alternating row backgrounds', () => {
  it('the row at index 1 receives isEvenRow treatment (bg-default class on wrapper)', () => {
    const tracks = [TRACK_A, TRACK_B, TRACK_C]
    const { container } = render(
      <PartyQueue {...defaultProps({ tracks, metadata: metadataFor(...tracks) })} />,
    )
    // Index 1 row is inside the second <li>; its inner div has bg-default when isEvenRow.
    const listItems = container.querySelectorAll('li')
    const evenRow = listItems[1].querySelector('div.bg-default')
    expect(evenRow).not.toBeNull()
  })

  it('the row at index 0 does NOT receive the even-row background', () => {
    const tracks = [TRACK_A, TRACK_B]
    const { container } = render(
      <PartyQueue {...defaultProps({ tracks, metadata: metadataFor(...tracks) })} />,
    )
    const firstItem = container.querySelectorAll('li')[0]
    // Index 0 has bg-content2 (playing) but not bg-default stripe
    expect(firstItem.querySelector('div.bg-default')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 7. hasPlayingRowAbove treatment on index 1
// ---------------------------------------------------------------------------

describe('hasPlayingRowAbove treatment', () => {
  it('the row at index 1 receives the mt-2 top margin (hasPlayingRowAbove)', () => {
    const tracks = [TRACK_A, TRACK_B, TRACK_C]
    const { container } = render(
      <PartyQueue {...defaultProps({ tracks, metadata: metadataFor(...tracks) })} />,
    )
    const listItems = container.querySelectorAll('li')
    const index1Row = listItems[1].querySelector('div.mt-2')
    expect(index1Row).not.toBeNull()
  })

  it('single-track queue: no mt-2 on the only row', () => {
    const { container } = render(
      <PartyQueue {...defaultProps({ tracks: [TRACK_A], metadata: metadataFor(TRACK_A) })} />,
    )
    expect(container.querySelector('div.mt-2')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 8. Reorder animation - View Transitions API
// ---------------------------------------------------------------------------

describe('reorder animation', () => {
  const mockStartViewTransition = vi.fn()

  function stubMatchMedia(reducedMotion: boolean) {
    // jsdom does not implement matchMedia; define it with Object.defineProperty.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (_query: string) => ({
        matches: reducedMotion,
        media: _query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    })
  }

  beforeEach(() => {
    mockStartViewTransition.mockClear()
    Object.defineProperty(document, 'startViewTransition', {
      value: mockStartViewTransition,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (document as any).startViewTransition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).matchMedia
  })

  it('calls startViewTransition when track order changes and reduced-motion is off', () => {
    stubMatchMedia(false)

    const initialTracks = [TRACK_A, TRACK_B]
    const { rerender } = render(
      <PartyQueue {...defaultProps({ tracks: initialTracks, metadata: metadataFor(TRACK_A, TRACK_B) })} />,
    )

    // First render: no transition (prevOrder is empty).
    expect(mockStartViewTransition).not.toHaveBeenCalled()

    // Reorder: B now before A.
    rerender(
      <PartyQueue
        {...defaultProps({ tracks: [TRACK_B, TRACK_A], metadata: metadataFor(TRACK_A, TRACK_B) })}
      />,
    )

    expect(mockStartViewTransition).toHaveBeenCalledOnce()
  })

  it('does NOT call startViewTransition when prefers-reduced-motion is set', () => {
    stubMatchMedia(true) // reduced motion on

    const initialTracks = [TRACK_A, TRACK_B]
    const { rerender } = render(
      <PartyQueue {...defaultProps({ tracks: initialTracks, metadata: metadataFor(TRACK_A, TRACK_B) })} />,
    )

    rerender(
      <PartyQueue
        {...defaultProps({ tracks: [TRACK_B, TRACK_A], metadata: metadataFor(TRACK_A, TRACK_B) })}
      />,
    )

    expect(mockStartViewTransition).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 9. Currently-playing detection by index 0
// ---------------------------------------------------------------------------

describe('currently-playing detection', () => {
  it('only the first track (A) gets isPlaying=true when tracks are [A, B, C]', () => {
    // With isOwner=true and isMusicPlaying=true, the play/pause button appears ONLY
    // on the playing row. Verify there is exactly one pause button.
    const tracks = [TRACK_A, TRACK_B, TRACK_C]
    render(
      <PartyQueue
        {...defaultProps({
          tracks,
          metadata: metadataFor(...tracks),
          isOwner: true,
          isMusicPlaying: true,
          isPlayButtonEnabled: true,
        })}
      />,
    )
    const pauseButtons = screen.queryAllByRole('button', { name: /pause/i })
    expect(pauseButtons).toHaveLength(1)
  })

  it('B and C tracks receive isPlaying=false (have vote buttons, not pause buttons)', () => {
    const tracks = [TRACK_A, TRACK_B, TRACK_C]
    render(
      <PartyQueue
        {...defaultProps({
          tracks,
          metadata: metadataFor(...tracks),
          isOwner: false,
        })}
      />,
    )
    // Non-playing rows get vote buttons.
    expect(screen.getByRole('button', { name: /vote for Title b/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /vote for Title c/i })).toBeInTheDocument()
  })
})
