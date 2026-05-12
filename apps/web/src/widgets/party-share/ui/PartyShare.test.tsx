/**
 * Tests for the PartyShare widget.
 *
 * Strategy: mock TanStack Router and shared/auth at module level, pre-seed
 * the TanStack Query cache with the party record and session, then assert on
 * visible output. vi.mock hoisting ensures modules are replaced before the
 * widget is imported.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Party } from '@/entities/party'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ partyId: 'abc123' }),
}))

vi.mock('@/shared/auth', () => ({
  getSession: vi.fn(() =>
    Promise.resolve({ id: 'host-user-1', name: 'Host', email: 'h@ex.com' }),
  ),
}))

// Import AFTER mocks are registered
import { PartyShare } from './PartyShare'
import { getSession } from '@/shared/auth'

// ---------------------------------------------------------------------------
// Shared mutable state
// ---------------------------------------------------------------------------

let currentSessionUserId: string | null = 'host-user-1'

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeParty(overrides: Partial<Party> = {}): Party {
  return {
    shortId: 'abc123',
    name: 'Test Party',
    countryCode: 'US',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'host-user-1',
    playback: {
      lastChange: '2026-01-01T00:00:00Z',
      lastPositionMs: 0,
      masterId: null,
      playing: false,
      targetPlaying: null,
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderWidget(party: Party | null = makeParty(), sessionPending = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  if (party !== null) {
    client.setQueryData(['party', 'abc123'], party)
  }

  if (!sessionPending) {
    client.setQueryData(
      ['session'],
      currentSessionUserId
        ? { id: currentSessionUserId, name: 'Host', email: 'h@ex.com' }
        : null,
    )
  }
  // When sessionPending=true the cache has no session data, simulating a
  // pending session query (isLoading=true from useQuery perspective via
  // query not yet resolved in cache).

  return render(
    <QueryClientProvider client={client}>
      <PartyShare />
    </QueryClientProvider>,
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setMock<F extends (...args: any[]) => any>(fn: F, value: ReturnType<F>) {
  vi.mocked(fn).mockReturnValue(value)
}

function resetDefaultMocks() {
  setMock(
    getSession,
    Promise.resolve(
      currentSessionUserId
        ? { id: currentSessionUserId, name: 'Host', email: 'h@ex.com' }
        : null,
    ) as ReturnType<typeof getSession>,
  )
}

// ---------------------------------------------------------------------------
// 1. Loading state: party null shows spinner
// ---------------------------------------------------------------------------

describe('loading state', () => {
  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
  })

  it('shows a spinner when party record is null', () => {
    renderWidget(null)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('spinner has aria-label "Loading party details..."', () => {
    renderWidget(null)
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Loading party details...',
    )
  })

  it('does not render the join code while loading', () => {
    renderWidget(null)
    expect(screen.queryByLabelText(/party join code/i)).not.toBeInTheDocument()
  })

  it('shows the spinner while the session query is still pending (party present)', () => {
    // sessionPending=true leaves the session cache empty so useQuery reports
    // isLoading=true on first render. The party record IS warmed in the cache.
    // This exercises the right-hand side of the `party === null || isSessionLoading` guard.
    renderWidget(makeParty(), /* sessionPending */ true)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByLabelText(/party join code/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 2. Host-gate: non-host sees unauthorized message
// ---------------------------------------------------------------------------

describe('host-gate', () => {
  beforeEach(() => {
    currentSessionUserId = 'guest-user-2'
    resetDefaultMocks()
  })

  afterEach(() => {
    currentSessionUserId = 'host-user-1'
  })

  it('renders the unauthorized message when user is not the host', () => {
    renderWidget()
    expect(
      screen.getByText(/only the party host can view share options/i),
    ).toBeInTheDocument()
  })

  it('does not render the join code for a non-host', () => {
    renderWidget()
    expect(screen.queryByLabelText(/party join code/i)).not.toBeInTheDocument()
  })

  it('does not render the Share button for a non-host', () => {
    renderWidget()
    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 3. Ready state: description + join code rendered
// ---------------------------------------------------------------------------

describe('ready state', () => {
  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
  })

  it('renders the description paragraph', () => {
    renderWidget()
    expect(screen.getByText(/guests can search and add songs/i)).toBeInTheDocument()
  })

  it('renders the join code', () => {
    renderWidget(makeParty({ shortId: 'abc123' }))
    expect(screen.getByLabelText(/party join code/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/party join code/i)).toHaveTextContent('abc123')
  })

  it('shows a dash fallback when shortId is empty', () => {
    renderWidget(makeParty({ shortId: '' }))
    expect(screen.getByLabelText(/party join code/i)).toHaveTextContent('-')
  })
})

// ---------------------------------------------------------------------------
// 4. Share button: rendered when navigator.share exists
// ---------------------------------------------------------------------------

describe('share button visibility', () => {
  let originalShare: typeof navigator.share

  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
    originalShare = navigator.share
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: originalShare,
    })
  })

  it('renders Share button when navigator.share is available', () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: vi.fn(),
    })

    renderWidget()
    expect(screen.getByRole('button', { name: /share party join link/i })).toBeInTheDocument()
  })

  it('does not render Share button when navigator.share is absent', () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    })

    renderWidget()
    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 5. Share button tap: calls navigator.share with correct payload
// ---------------------------------------------------------------------------

describe('share button tap', () => {
  let mockShare: ReturnType<typeof vi.fn>

  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
    mockShare = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: mockShare,
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    })
  })

  it('calls navigator.share with title set to the party name', async () => {
    renderWidget(makeParty({ name: 'Friday Night Jams' }))
    await userEvent.click(screen.getByRole('button', { name: /share party join link/i }))
    await waitFor(() => {
      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Friday Night Jams' }),
      )
    })
  })

  it('calls navigator.share with body text containing the party name', async () => {
    renderWidget(makeParty({ name: 'Friday Night Jams' }))
    await userEvent.click(screen.getByRole('button', { name: /share party join link/i }))
    await waitFor(() => {
      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('Friday Night Jams'),
        }),
      )
    })
  })

  it('calls navigator.share with a url containing the partyId', async () => {
    renderWidget(makeParty({ shortId: 'abc123' }))
    await userEvent.click(screen.getByRole('button', { name: /share party join link/i }))
    await waitFor(() => {
      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/party/abc123'),
        }),
      )
    })
  })
})

// ---------------------------------------------------------------------------
// 6. Share button rejection: console.warn called, no crash
// ---------------------------------------------------------------------------

describe('share rejection', () => {
  let mockShare: ReturnType<typeof vi.fn>

  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
    mockShare = vi.fn().mockRejectedValue(new DOMException('Dismissed', 'AbortError'))
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: mockShare,
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    })
  })

  it('calls console.warn when share is rejected', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderWidget()
    await userEvent.click(screen.getByRole('button', { name: /share party join link/i }))
    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PartyShare]'),
        expect.any(DOMException),
      )
    })
    warnSpy.mockRestore()
  })

  it('does not crash when share is rejected', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderWidget()
    // Should not throw
    await expect(
      userEvent.click(screen.getByRole('button', { name: /share party join link/i })),
    ).resolves.not.toThrow()
    vi.restoreAllMocks()
  })
})

// ---------------------------------------------------------------------------
// 7. Accessibility spot-checks
// ---------------------------------------------------------------------------

describe('accessibility', () => {
  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
  })

  it('join code element has aria-label "Party join code"', () => {
    renderWidget()
    expect(screen.getByLabelText('Party join code')).toBeInTheDocument()
  })

  it('loading region has role=status and aria-busy=true', () => {
    renderWidget(null)
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-busy', 'true')
  })

  it('unauthorized message has role=alert', () => {
    currentSessionUserId = 'guest-user-2'
    renderWidget()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
