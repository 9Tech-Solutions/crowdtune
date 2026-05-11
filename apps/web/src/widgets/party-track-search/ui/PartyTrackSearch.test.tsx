import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { Metadata, TrackReference } from '@/entities/track'
import { TestQueryProvider } from '@/shared/test/test-providers'

// ---------------------------------------------------------------------------
// Module mocks (hoisted by Vitest before imports)
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()
const mockMutate = vi.fn()
let mockSearchParams: { q?: string } = {}

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ partyId: 'party-123' }),
  useSearch: () => mockSearchParams,
  useNavigate: () => mockNavigate,
}))

const mockSearchState: {
  data: import('../api/useSearchTracks').SearchResult[] | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
} = {
  data: [],
  isLoading: false,
  isError: false,
  error: null,
}

vi.mock('../api/useSearchTracks', () => ({
  useSearchTracks: vi.fn(() => mockSearchState),
}))

vi.mock('../api/useAddTrack', () => ({
  useAddTrack: vi.fn(() => ({ mutate: mockMutate })),
}))

// Import after mocks
import { PartyTrackSearch } from './PartyTrackSearch'
import type { SearchResult } from '../api/useSearchTracks'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMetadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    title: 'Test Track',
    artists: ['Test Artist'],
    coverImages: [],
    durationMs: 180_000,
    isPlayable: true,
    ...overrides,
  }
}

function makeTrackRef(id = 'track-1'): TrackReference {
  return { provider: 'spotify', id }
}

function setSearch(overrides: {
  data?: SearchResult[]
  isLoading?: boolean
  isError?: boolean
  error?: Error | null
}) {
  Object.assign(mockSearchState, overrides)
}

function renderWidget() {
  return render(
    <TestQueryProvider>
      <PartyTrackSearch />
    </TestQueryProvider>,
  )
}

function getInput() {
  return screen.getByRole('textbox', { name: /search for tracks/i })
}

// ---------------------------------------------------------------------------
// 1. Initial render: idle prompt visible, input focused
// ---------------------------------------------------------------------------

describe('initial render (idle)', () => {
  beforeEach(() => {
    mockSearchParams = {}
    setSearch({ data: [], isLoading: false, isError: false, error: null })
  })

  it('shows the idle prompt when no query is active', () => {
    renderWidget()
    expect(screen.getByText(/search for songs to add to the queue/i)).toBeInTheDocument()
  })

  it('renders the search input', () => {
    renderWidget()
    expect(getInput()).toBeInTheDocument()
  })

  it('focuses the input on mount', () => {
    renderWidget()
    expect(document.activeElement).toBe(getInput())
  })
})

// ---------------------------------------------------------------------------
// 2. Typing: input updates per keystroke
// ---------------------------------------------------------------------------

describe('typing behavior', () => {
  beforeEach(() => {
    mockSearchParams = {}
    mockNavigate.mockClear()
    setSearch({ data: [], isLoading: false, isError: false, error: null })
  })

  it('updates input value on each keystroke via fireEvent', () => {
    renderWidget()
    const input = getInput()
    fireEvent.change(input, { target: { value: 'Qu' } })
    expect(input).toHaveValue('Qu')
  })

  it('does not call navigate immediately on change (debounce pending)', () => {
    vi.useFakeTimers()
    try {
      renderWidget()
      const input = getInput()
      mockNavigate.mockClear()
      fireEvent.change(input, { target: { value: 'Q' } })
      // No time has passed - debounce has not fired
      expect(mockNavigate).not.toHaveBeenCalled()
    } finally {
      vi.runAllTimers()
      vi.useRealTimers()
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Debounce: after 300ms URL param updates
// ---------------------------------------------------------------------------

describe('debounce', () => {
  beforeEach(() => {
    mockSearchParams = {}
    mockNavigate.mockClear()
    setSearch({ data: [], isLoading: false, isError: false, error: null })
  })

  it('calls navigate after 300ms with the typed query', () => {
    vi.useFakeTimers()
    try {
      renderWidget()
      const input = getInput()
      mockNavigate.mockClear()
      act(() => {
        fireEvent.change(input, { target: { value: 'Queen' } })
      })
      act(() => vi.advanceTimersByTime(300))
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '/party/$partyId/search',
          search: expect.objectContaining({ q: 'Queen' }),
        }),
      )
    } finally {
      vi.runAllTimers()
      vi.useRealTimers()
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Enter: fires search immediately
// ---------------------------------------------------------------------------

describe('Enter key', () => {
  beforeEach(() => {
    mockSearchParams = {}
    mockNavigate.mockClear()
    setSearch({ data: [], isLoading: false, isError: false, error: null })
  })

  it('fires navigate immediately on Enter key down', () => {
    vi.useFakeTimers()
    try {
      renderWidget()
      const input = getInput()
      mockNavigate.mockClear()
      act(() => {
        fireEvent.change(input, { target: { value: 'Boh' } })
      })
      // Press Enter before the 300ms debounce fires
      act(() => {
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
      })
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: expect.objectContaining({ q: 'Boh' }),
        }),
      )
    } finally {
      vi.runAllTimers()
      vi.useRealTimers()
    }
  })
})

// ---------------------------------------------------------------------------
// 5. Escape: clears input, clears URL param, returns to idle, focus stays
// ---------------------------------------------------------------------------

describe('Escape key', () => {
  beforeEach(() => {
    mockSearchParams = {}
    mockNavigate.mockClear()
    setSearch({ data: [], isLoading: false, isError: false, error: null })
  })

  it('clears the input text on Escape', () => {
    renderWidget()
    const input = getInput()
    act(() => {
      fireEvent.change(input, { target: { value: 'Test' } })
    })
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })
    })
    expect(input).toHaveValue('')
  })

  it('calls navigate with q: undefined on Escape', () => {
    renderWidget()
    const input = getInput()
    act(() => {
      fireEvent.change(input, { target: { value: 'Test' } })
    })
    mockNavigate.mockClear()
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })
    })
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        search: expect.objectContaining({ q: undefined }),
      }),
    )
  })

  it('keeps focus on the input after Escape', () => {
    renderWidget()
    const input = getInput()
    act(() => {
      fireEvent.change(input, { target: { value: 'Test' } })
    })
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' })
    })
    expect(document.activeElement).toBe(input)
  })

  it('shows the idle prompt when URL has no committed query', () => {
    mockSearchParams = {}
    setSearch({ data: [], isLoading: false, isError: false, error: null })
    renderWidget()
    expect(screen.getByText(/search for songs to add to the queue/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 6. URL-pre-populated query on mount: input is pre-filled
// ---------------------------------------------------------------------------

describe('URL-pre-populated query', () => {
  it('pre-fills the input with the URL query param on mount', () => {
    mockSearchParams = { q: 'pre-filled' }
    setSearch({ data: [], isLoading: false, isError: false, error: null })
    renderWidget()
    expect(getInput()).toHaveValue('pre-filled')
    mockSearchParams = {}
  })
})

// ---------------------------------------------------------------------------
// 7. Loading state: loading indicator renders; aria-busy="true"
// ---------------------------------------------------------------------------

describe('loading state', () => {
  it('renders the loading spinner when isLoading is true', () => {
    mockSearchParams = { q: 'loading query' }
    setSearch({ data: undefined, isLoading: true, isError: false, error: null })
    const { container } = renderWidget()
    expect(container.querySelector('[data-slot="spinner"]')).not.toBeNull()
    mockSearchParams = {}
    setSearch({ data: [], isLoading: false, isError: false, error: null })
  })

  it('sets aria-busy="true" on the results region while loading', () => {
    mockSearchParams = { q: 'loading query' }
    setSearch({ data: undefined, isLoading: true, isError: false, error: null })
    renderWidget()
    const region = screen.getByRole('region', { name: /search results/i })
    expect(region).toHaveAttribute('aria-busy', 'true')
    mockSearchParams = {}
    setSearch({ data: [], isLoading: false, isError: false, error: null })
  })
})

// ---------------------------------------------------------------------------
// 8. Results rendered: 3 mock tracks produce 3 SearchResultRow instances
// ---------------------------------------------------------------------------

describe('results rendering', () => {
  it('renders one row per search result', () => {
    const results: SearchResult[] = [
      { trackRef: makeTrackRef('1'), metadata: makeMetadata({ title: 'Song One' }) },
      { trackRef: makeTrackRef('2'), metadata: makeMetadata({ title: 'Song Two' }) },
      { trackRef: makeTrackRef('3'), metadata: makeMetadata({ title: 'Song Three' }) },
    ]
    mockSearchParams = { q: 'song' }
    setSearch({ data: results, isLoading: false, isError: false, error: null })
    renderWidget()
    expect(screen.getByText('Song One')).toBeInTheDocument()
    expect(screen.getByText('Song Two')).toBeInTheDocument()
    expect(screen.getByText('Song Three')).toBeInTheDocument()
    mockSearchParams = {}
    setSearch({ data: [], isLoading: false, isError: false, error: null })
  })
})

// ---------------------------------------------------------------------------
// 9. No-results state: empty results with non-empty query shows no-results message
// ---------------------------------------------------------------------------

describe('no-results state', () => {
  it('shows the no-results message when search returns empty array for an active query', () => {
    mockSearchParams = { q: 'zzz-no-results' }
    setSearch({ data: [], isLoading: false, isError: false, error: null })
    renderWidget()
    expect(screen.getByText(/no tracks found/i)).toBeInTheDocument()
    mockSearchParams = {}
  })
})

// ---------------------------------------------------------------------------
// 10. Error state: isError shows the error message
// ---------------------------------------------------------------------------

describe('error state', () => {
  it('shows the error message when useSearchTracks returns isError', () => {
    mockSearchParams = { q: 'errored query' }
    setSearch({ data: undefined, isLoading: false, isError: true, error: new Error('Net') })
    renderWidget()
    expect(screen.getByText(/search is unavailable right now/i)).toBeInTheDocument()
    mockSearchParams = {}
    setSearch({ data: [], isLoading: false, isError: false, error: null })
  })
})

// ---------------------------------------------------------------------------
// 11. Add-to-queue tap: fires mutate with the track reference
// ---------------------------------------------------------------------------

describe('add to queue', () => {
  it('calls mutate with the trackRef when the add button is pressed', async () => {
    const trackRef = makeTrackRef('add-me')
    mockSearchParams = { q: 'add' }
    setSearch({
      data: [{ trackRef, metadata: makeMetadata({ title: 'Add Me' }) }],
      isLoading: false,
      isError: false,
      error: null,
    })
    mockMutate.mockClear()
    renderWidget()
    await userEvent.click(screen.getByRole('button', { name: /Add Add Me/i }))
    expect(mockMutate).toHaveBeenCalledWith(trackRef, expect.any(Object))
    mockSearchParams = {}
    setSearch({ data: [], isLoading: false, isError: false, error: null })
  })
})

// ---------------------------------------------------------------------------
// 12. Already-queued overlay: after successful add, row shows "already queued"
// ---------------------------------------------------------------------------

describe('already-queued overlay', () => {
  it('shows the already-queued variant after a successful add', async () => {
    const trackRef = makeTrackRef('queued-track')
    mockSearchParams = { q: 'queued' }
    setSearch({
      data: [{ trackRef, metadata: makeMetadata({ title: 'Queued Song' }) }],
      isLoading: false,
      isError: false,
      error: null,
    })

    mockMutate.mockImplementationOnce(
      (_ref: TrackReference, opts: { onSuccess: () => void }) => {
        opts.onSuccess()
      },
    )

    renderWidget()
    await userEvent.click(screen.getByRole('button', { name: /Add Queued Song/i }))
    expect(screen.getByRole('button', { name: /already queued/i })).toBeInTheDocument()
    mockSearchParams = {}
    setSearch({ data: [], isLoading: false, isError: false, error: null })
  })
})
