/**
 * Tests for PartyTvPage.
 *
 * Strategy: mock TanStack Router, the three query hooks, and any widgets that
 * need external infrastructure. Pre-seed the query cache with fixtures and
 * assert on visible output. TvTrackCard is NOT mocked - it is rendered as-is
 * per spec section 12.
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TestQueryProvider } from '@/shared/test/test-providers'
import type { Track, Metadata } from '@/entities/track'
import type { Party } from '@/entities/party'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', () => ({
  useParams: vi.fn(() => ({ partyId: 'test-party' })),
  useNavigate: vi.fn(() => vi.fn()),
}))

vi.mock('@/pages/party/api/use-party-query', () => ({
  usePartyQuery: vi.fn(() => ({ data: null, isLoading: false, error: null })),
}))

vi.mock('@/pages/party/api/use-playback-query', () => ({
  usePlaybackQuery: vi.fn(() => ({ data: null, isLoading: false, error: null })),
}))

vi.mock('../api/use-tv-queue-query', () => ({
  useTvQueueQuery: vi.fn(() => ({ tracks: [], metadataByKey: {}, isLoading: false, error: null })),
}))

vi.mock('@/widgets/playback-progress-bar', () => ({
  PlaybackProgressBar: vi.fn(() => (
    <div data-testid="playback-progress-bar" role="progressbar" aria-label="Track playback progress" />
  )),
}))

// ---------------------------------------------------------------------------
// Late imports (after mocks are registered)
// ---------------------------------------------------------------------------

import { PartyTvPage } from './PartyTvPage'
import { usePartyQuery } from '@/pages/party/api/use-party-query'
import { useTvQueueQuery } from '../api/use-tv-queue-query'
import { useNavigate } from '@tanstack/react-router'

const mockUsePartyQuery = vi.mocked(usePartyQuery)
const mockUseTvQueueQuery = vi.mocked(useTvQueueQuery)
const mockUseNavigate = vi.mocked(useNavigate)

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeParty(overrides: Partial<Party> = {}): Party {
  return {
    id: 'TEST',
    shortId: 'TEST',
    name: 'Test Party',
    countryCode: 'US',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    hostUserId: 'host-user-id',
    isActive: true,
    playback: {
      lastChange: '2024-01-01T00:00:00Z',
      lastPositionMs: 0,
      masterId: null,
      playing: false,
      targetPlaying: null,
    },
    ...overrides,
  }
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    ref: { provider: 'spotify', id: `track-${Math.random().toString(36).slice(2)}` },
    addedAt: '2024-01-01T00:00:00Z',
    isFallback: false,
    voteCount: 3,
    order: 1,
    ...overrides,
  }
}

function makeMetadata(title = 'Test Track', overrides: Partial<Metadata> = {}): Metadata {
  return {
    title,
    artists: ['Test Artist'],
    coverImages: [{ url: 'https://example.com/cover.jpg', width: 640, height: 640 }],
    durationMs: 210000,
    isPlayable: true,
    ...overrides,
  }
}

function makeTrackWithKey(order: number, title: string, voteCount = 0) {
  const track = makeTrack({ order, voteCount, addedAt: `2024-01-01T0${order}:00:00Z` })
  const key = `spotify-${track.ref.id}`
  const metadata = makeMetadata(title)
  return { track, key, metadata }
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <TestQueryProvider>
      <PartyTvPage />
    </TestQueryProvider>,
  )
}

// ---------------------------------------------------------------------------
// beforeEach defaults
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockUsePartyQuery.mockReturnValue({ data: null, isLoading: false, error: null })
  mockUseTvQueueQuery.mockReturnValue({ tracks: [], metadataByKey: {}, isLoading: false, error: null })
  mockUseNavigate.mockReturnValue(vi.fn())

  // jsdom does not implement matchMedia; stub it so prefersReducedMotion()
  // doesn't throw. Default: reduced motion OFF (normal test scenario).
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (_query: string) => ({
      matches: false,
      media: _query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
})

// ---------------------------------------------------------------------------
// 1. Loading state: queue-loaded flag is false
// ---------------------------------------------------------------------------

describe('loading state', () => {
  it('renders the loading panel when queue is loading', () => {
    mockUseTvQueueQuery.mockReturnValue({ tracks: [], metadataByKey: {}, isLoading: true, error: null })
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/Loading\.\.\./i)).toBeInTheDocument()
  })

  it('renders the loading panel when party is loading', () => {
    mockUsePartyQuery.mockReturnValue({ data: null, isLoading: true, error: null })
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders loading when tracks exist but metadata for the now-playing track has not arrived', () => {
    const track = makeTrack({ order: 1 })
    const key = `spotify-${track.ref.id}`
    // metadataByKey does not include the current track's key
    mockUseTvQueueQuery.mockReturnValue({
      tracks: [track],
      metadataByKey: {},
      isLoading: false,
      error: null,
    })
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    // key is not used at runtime here - it's just for clarity that meta is absent
    void key
    renderPage()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 2. Error state
// ---------------------------------------------------------------------------

describe('error state', () => {
  it('renders the error panel when partyError is non-null', () => {
    mockUsePartyQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Party not found'),
    })
    renderPage()
    // copy review: "Party unavailable" heading
    expect(screen.getByText(/party unavailable/i)).toBeInTheDocument()
  })

  it('displays the error message text from the error object', () => {
    mockUsePartyQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Network error'),
    })
    renderPage()
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 3. Empty queue state
// ---------------------------------------------------------------------------

describe('empty queue state', () => {
  it('renders the empty-queue panel when queue has zero tracks', () => {
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    mockUseTvQueueQuery.mockReturnValue({ tracks: [], metadataByKey: {}, isLoading: false, error: null })
    renderPage()
    // copy review: "Queue is empty" heading
    expect(screen.getByText(/queue is empty/i)).toBeInTheDocument()
  })

  it('renders the TV mode text from the party record in the empty panel', () => {
    mockUsePartyQuery.mockReturnValue({
      data: makeParty({ settings: { tvDisplayText: 'Add songs at crowdtune.app/TEST', allowAnonymousVoting: true, allowExplicitTracks: true, allowMultipleVotesPerSearch: true, maxTrackLengthMinutes: null } }),
      isLoading: false,
      error: null,
    })
    mockUseTvQueueQuery.mockReturnValue({ tracks: [], metadataByKey: {}, isLoading: false, error: null })
    renderPage()
    expect(screen.getByText('Add songs at crowdtune.app/TEST')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 4. Populated state
// ---------------------------------------------------------------------------

describe('populated state', () => {
  function setupPopulated(trackCount = 1) {
    const items = Array.from({ length: trackCount }, (_, i) =>
      makeTrackWithKey(i + 1, `Track ${i + 1}`, i),
    )
    const tracks = items.map((x) => x.track)
    const metadataByKey: Record<string, Metadata> = {}
    items.forEach(({ key, metadata }) => { metadataByKey[key] = metadata })

    mockUseTvQueueQuery.mockReturnValue({ tracks, metadataByKey, isLoading: false, error: null })
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
  }

  it('renders the populated layout when loading is complete with at least one track and metadata', () => {
    setupPopulated(1)
    renderPage()
    // region landmark present
    expect(screen.getByRole('region', { name: /now playing/i })).toBeInTheDocument()
  })

  it('upper region displays the correct track name for the currently-playing track', () => {
    setupPopulated(1)
    renderPage()
    expect(screen.getByText('Track 1')).toBeInTheDocument()
  })

  it('upper region displays the correct artist name for the currently-playing track', () => {
    setupPopulated(1)
    renderPage()
    expect(screen.getByText('Test Artist')).toBeInTheDocument()
  })

  it('upper region displays the party join code in the pill badge', () => {
    setupPopulated(1)
    renderPage()
    expect(screen.getByText('test-party')).toBeInTheDocument()
  })

  it('upper region displays the TV mode text from the party record', () => {
    const items = [makeTrackWithKey(1, 'Track 1', 0)]
    const tracks = items.map((x) => x.track)
    const metadataByKey: Record<string, Metadata> = {}
    items.forEach(({ key, metadata }) => { metadataByKey[key] = metadata })

    mockUseTvQueueQuery.mockReturnValue({ tracks, metadataByKey, isLoading: false, error: null })
    mockUsePartyQuery.mockReturnValue({
      data: makeParty({ settings: { tvDisplayText: 'Join at TEST', allowAnonymousVoting: true, allowExplicitTracks: true, allowMultipleVotesPerSearch: true, maxTrackLengthMinutes: null } }),
      isLoading: false,
      error: null,
    })
    renderPage()
    expect(screen.getByText('Join at TEST')).toBeInTheDocument()
  })

  it('PlaybackProgressBar is rendered in the upper region', () => {
    setupPopulated(1)
    renderPage()
    expect(screen.getByTestId('playback-progress-bar')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 5. Queue strip card counts
// ---------------------------------------------------------------------------

describe('queue strip card counts', () => {
  function setupQueue(trackCount: number) {
    const items = Array.from({ length: trackCount }, (_, i) =>
      makeTrackWithKey(i + 1, `Track ${i + 1}`, i),
    )
    const tracks = items.map((x) => x.track)
    const metadataByKey: Record<string, Metadata> = {}
    items.forEach(({ key, metadata }) => { metadataByKey[key] = metadata })
    mockUseTvQueueQuery.mockReturnValue({ tracks, metadataByKey, isLoading: false, error: null })
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
  }

  it('lower strip renders no listitem cards when the queue has exactly one track', () => {
    setupQueue(1)
    renderPage()
    const listitems = screen.queryAllByRole('listitem')
    expect(listitems.length).toBe(0)
  })

  it('lower strip renders exactly 29 cards when the queue has 30 or more tracks', () => {
    setupQueue(31)
    renderPage()
    const listitems = screen.getAllByRole('listitem')
    expect(listitems.length).toBe(29)
  })

  it('lower strip renders exactly N-1 cards when queue has N tracks (N=5)', () => {
    setupQueue(5)
    renderPage()
    const listitems = screen.getAllByRole('listitem')
    expect(listitems.length).toBe(4)
  })

  it('lower strip renders exactly N-1 cards when queue has N tracks (N=2)', () => {
    setupQueue(2)
    renderPage()
    const listitems = screen.getAllByRole('listitem')
    expect(listitems.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 6. TvTrackCard vote counts
// ---------------------------------------------------------------------------

describe('TvTrackCard vote counts', () => {
  it('each TvTrackCard in the strip shows the correct vote count for its track', () => {
    const t1 = makeTrackWithKey(1, 'Track 1', 0)
    const t2 = makeTrackWithKey(2, 'Track 2', 7)
    const t3 = makeTrackWithKey(3, 'Track 3', 12)

    const tracks = [t1.track, t2.track, t3.track]
    const metadataByKey: Record<string, Metadata> = {
      [t1.key]: t1.metadata,
      [t2.key]: t2.metadata,
      [t3.key]: t3.metadata,
    }

    mockUseTvQueueQuery.mockReturnValue({ tracks, metadataByKey, isLoading: false, error: null })
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()

    // Track 2 has 7 votes, Track 3 has 12 votes (Track 1 is now-playing, not in strip)
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 7. Background image selection
// ---------------------------------------------------------------------------

describe('background image', () => {
  function setupWithBackground(backgroundImages: string[]) {
    const track = makeTrack({ order: 1 })
    const key = `spotify-${track.ref.id}`
    const metadata = makeMetadata('ABCDE', {
      backgroundImages,
    })
    mockUseTvQueueQuery.mockReturnValue({
      tracks: [track],
      metadataByKey: { [key]: metadata },
      isLoading: false,
      error: null,
    })
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
  }

  it('uses Ken Burns variant class when metadata has a non-empty background image array', () => {
    setupWithBackground(['https://bg.example.com/1.jpg', 'https://bg.example.com/2.jpg'])
    const { container } = renderPage()
    const bgImg = container.querySelector('img[aria-hidden="true"]')
    expect(bgImg).not.toBeNull()
    expect(bgImg?.className).toContain('tv-ken-burns')
  })

  it('does NOT apply Ken Burns class when metadata has no background images', () => {
    setupWithBackground([])
    const { container } = renderPage()
    const bgImg = container.querySelector('img[aria-hidden="true"]')
    // Falls back to cover art - no Ken Burns class
    expect(bgImg?.className ?? '').not.toContain('tv-ken-burns')
  })

  it('background image index is computed as trackName.length % backgroundImages.length', () => {
    // "ABCDE" has 5 chars; 3 background images -> index = 5 % 3 = 2
    const bg0 = 'https://bg.example.com/0.jpg'
    const bg1 = 'https://bg.example.com/1.jpg'
    const bg2 = 'https://bg.example.com/2.jpg'
    setupWithBackground([bg0, bg1, bg2])
    const { container } = renderPage()
    const bgImg = container.querySelector('img[aria-hidden="true"]')
    expect(bgImg?.getAttribute('src')).toBe(bg2)
  })
})

// ---------------------------------------------------------------------------
// 8. Mouse cursor auto-hide
// ---------------------------------------------------------------------------

describe('mouse cursor auto-hide', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const track = makeTrack({ order: 1 })
    const key = `spotify-${track.ref.id}`
    mockUseTvQueueQuery.mockReturnValue({
      tracks: [track],
      metadataByKey: { [key]: makeMetadata('Test') },
      isLoading: false,
      error: null,
    })
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mouse movement makes the cursor visible (cursor-auto class)', () => {
    const { container } = renderPage()
    const root = container.firstElementChild as HTMLElement
    act(() => { fireEvent.mouseMove(window) })
    expect(root.className).toContain('cursor-auto')
  })

  it('mouse cursor hides after 3000 milliseconds of no movement', () => {
    const { container } = renderPage()
    const root = container.firstElementChild as HTMLElement
    act(() => { fireEvent.mouseMove(window) })
    expect(root.className).toContain('cursor-auto')
    act(() => { vi.advanceTimersByTime(3000) })
    expect(root.className).toContain('cursor-none')
  })

  it('mouse movement before 3000ms resets the timer and keeps cursor visible', () => {
    const { container } = renderPage()
    const root = container.firstElementChild as HTMLElement
    act(() => { fireEvent.mouseMove(window) })
    act(() => { vi.advanceTimersByTime(2000) })
    // Move again before timer fires - resets the 3s window
    act(() => { fireEvent.mouseMove(window) })
    act(() => { vi.advanceTimersByTime(2000) })
    // Still visible - 2s have passed since last move, not 3s
    expect(root.className).toContain('cursor-auto')
  })

  it('component unmounts cleanly without timer leaks', () => {
    const { unmount } = renderPage()
    act(() => { fireEvent.mouseMove(window) })
    // Should not throw or warn when unmounting with a pending timer
    expect(() => unmount()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 9. No interactive elements in populated state
// ---------------------------------------------------------------------------

describe('no interactive controls', () => {
  it('renders no buttons or links in the populated state', () => {
    const track = makeTrack({ order: 1 })
    const key = `spotify-${track.ref.id}`
    mockUseTvQueueQuery.mockReturnValue({
      tracks: [track],
      metadataByKey: { [key]: makeMetadata('Track 1') },
      isLoading: false,
      error: null,
    })
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 10. prefers-reduced-motion
// ---------------------------------------------------------------------------

describe('prefers-reduced-motion', () => {
  function stubReducedMotion(reduced: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: reduced && query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    })
  }

  it('does NOT apply tv-ken-burns class when prefers-reduced-motion is set', () => {
    stubReducedMotion(true)

    const track = makeTrack({ order: 1 })
    const key = `spotify-${track.ref.id}`
    mockUseTvQueueQuery.mockReturnValue({
      tracks: [track],
      metadataByKey: { [key]: makeMetadata('Test', { backgroundImages: ['https://bg.example.com/1.jpg'] }) },
      isLoading: false,
      error: null,
    })
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    const { container } = renderPage()
    const bgImg = container.querySelector('img[aria-hidden="true"]')
    expect(bgImg?.className ?? '').not.toContain('tv-ken-burns')
  })

  it('does not apply viewTransitionName on queue cards when prefers-reduced-motion is set', () => {
    stubReducedMotion(true)

    const items = Array.from({ length: 3 }, (_, i) => makeTrackWithKey(i + 1, `Track ${i + 1}`))
    const tracks = items.map((x) => x.track)
    const metadataByKey: Record<string, Metadata> = {}
    items.forEach(({ key, metadata }) => { metadataByKey[key] = metadata })

    mockUseTvQueueQuery.mockReturnValue({ tracks, metadataByKey, isLoading: false, error: null })
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    const { container } = renderPage()

    // No element in the strip should have a viewTransitionName style when reduced motion is active
    const cardWrappers = container.querySelectorAll('[style*="viewTransitionName"]')
    expect(cardWrappers.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 11. Accessibility: ARIA roles and labels
// ---------------------------------------------------------------------------

describe('accessibility', () => {
  function setupPopulatedSingle() {
    const track = makeTrack({ order: 1 })
    const key = `spotify-${track.ref.id}`
    mockUseTvQueueQuery.mockReturnValue({
      tracks: [track],
      metadataByKey: { [key]: makeMetadata('Track 1') },
      isLoading: false,
      error: null,
    })
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
  }

  it('the now-playing region carries role="region" and an accessible label', () => {
    setupPopulatedSingle()
    renderPage()
    expect(screen.getByRole('region', { name: /now playing/i })).toBeInTheDocument()
  })

  it('the queue strip carries role="list"', () => {
    const items = Array.from({ length: 3 }, (_, i) => makeTrackWithKey(i + 1, `Track ${i + 1}`))
    const tracks = items.map((x) => x.track)
    const metadataByKey: Record<string, Metadata> = {}
    items.forEach(({ key, metadata }) => { metadataByKey[key] = metadata })
    mockUseTvQueueQuery.mockReturnValue({ tracks, metadataByKey, isLoading: false, error: null })
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('each card in the strip has role="listitem"', () => {
    const items = Array.from({ length: 3 }, (_, i) => makeTrackWithKey(i + 1, `Track ${i + 1}`))
    const tracks = items.map((x) => x.track)
    const metadataByKey: Record<string, Metadata> = {}
    items.forEach(({ key, metadata }) => { metadataByKey[key] = metadata })
    mockUseTvQueueQuery.mockReturnValue({ tracks, metadataByKey, isLoading: false, error: null })
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()
    const listitems = screen.getAllByRole('listitem')
    expect(listitems.length).toBe(2)
  })
})
