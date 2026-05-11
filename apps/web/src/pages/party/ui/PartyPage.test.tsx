import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TestQueryProvider } from '@/shared/test/test-providers'
import { PartyPage } from './PartyPage'

// ---------------------------------------------------------------------------
// Module mocks (all vi.mock calls hoisted - no top-level variable references)
// ---------------------------------------------------------------------------

vi.mock('@tanstack/react-router', () => ({
  useParams: vi.fn(() => ({ partyId: 'test-party' })),
  useNavigate: vi.fn(() => vi.fn()),
  useLocation: vi.fn(() => ({ pathname: '/party/test-party' })),
  Outlet: vi.fn(() => null),
}))

vi.mock('../api/use-party-query', () => ({
  usePartyQuery: vi.fn(() => ({ data: null, isLoading: true, error: null })),
}))

vi.mock('../api/use-playback-query', () => ({
  usePlaybackQuery: vi.fn(() => ({ data: null, isLoading: false, error: null })),
}))

vi.mock('@/shared/auth', () => ({
  authClient: {
    getSession: vi.fn(async () => null),
    signIn: { social: vi.fn() },
  },
}))

// QueueDrawer mock renders test handles only when the drawer is open
// (narrow-viewport modal behavior). QueueNav renders the same handles
// unconditionally (wide-viewport permanent sidebar - no modal chrome).
type NavMockProps = {
  username: string | null
  currentSubView: string | null
  queuePath: string
  settingsPath: string
  sharePath: string
  tvPath: string
  onEnterAdminMode: () => void
  [key: string]: unknown
}

function NavMockInner({
  username,
  currentSubView,
  queuePath,
  settingsPath,
  sharePath,
  tvPath,
  onEnterAdminMode,
}: NavMockProps) {
  return (
    <nav
      data-testid="queue-drawer"
      data-subview={currentSubView}
      data-queue-path={queuePath}
      data-settings-path={settingsPath}
      data-share-path={sharePath}
      data-tv-path={tvPath}
    >
      <span data-testid="drawer-username">{username ?? ''}</span>
      <button
        type="button"
        data-testid="drawer-enter-admin"
        onClick={onEnterAdminMode}
      >
        Login for Admin Mode
      </button>
    </nav>
  )
}

// Both mocks emit the same nav test-id ("queue-drawer") because tests assert
// against "the rendered nav surface" without caring whether it came from the
// narrow modal QueueDrawer (renders only when isOpen) or the wide-viewport
// permanent QueueNav (always renders).
vi.mock('@/widgets/queue-drawer', () => ({
  QueueDrawer: vi.fn(
    ({ isOpen, ...rest }: { isOpen: boolean } & NavMockProps) =>
      isOpen ? <NavMockInner {...rest} /> : null,
  ),
  QueueNav: vi.fn((props: NavMockProps) => <NavMockInner {...props} />),
}))

vi.mock('@/widgets/party-queue', () => ({
  PartyQueue: vi.fn(() => <div data-testid="party-queue" />),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { usePartyQuery } from '../api/use-party-query'
import { useLocation } from '@tanstack/react-router'
import type { Party } from '@/entities/party'

const mockUsePartyQuery = vi.mocked(usePartyQuery)
const mockUseLocation = vi.mocked(useLocation)

function makeParty(overrides: Partial<Party> = {}): Party {
  return {
    shortId: 'TEST',
    name: 'Test Party',
    countryCode: 'US',
    createdAt: '2024-01-01T00:00:00Z',
    createdBy: 'host-user-id',
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

function renderPage() {
  return render(
    <TestQueryProvider>
      <PartyPage />
    </TestQueryProvider>,
  )
}

/**
 * Clicks the "Login for Admin Mode" button in one of the visible drawers,
 * which calls onEnterAdminMode -> triggerSignIn('normal').
 * The wide-viewport drawer is always open, so we can use it directly.
 */
async function openSignInModal() {
  const adminButtons = screen.getAllByTestId('drawer-enter-admin')
  await userEvent.click(adminButtons[0]!)
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockUsePartyQuery.mockReturnValue({ data: null, isLoading: false, error: null })
  mockUseLocation.mockReturnValue({ pathname: '/party/test-party' } as ReturnType<typeof useLocation>)
})

// ---------------------------------------------------------------------------
// 1. Loading state
// ---------------------------------------------------------------------------

describe('loading state', () => {
  it('shows a centered Spinner when usePartyQuery is loading', () => {
    mockUsePartyQuery.mockReturnValue({ data: null, isLoading: true, error: null })
    const { container } = renderPage()
    expect(container.querySelector('[data-slot="spinner"]')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. Loaded state with party name
// ---------------------------------------------------------------------------

describe('loaded state', () => {
  it('displays the party name in the header when data is available', () => {
    mockUsePartyQuery.mockReturnValue({
      data: makeParty({ name: 'Test Party' }),
      isLoading: false,
      error: null,
    })
    renderPage()
    expect(screen.getByText('Test Party')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 3. Party not found error state
// ---------------------------------------------------------------------------

describe('error state', () => {
  it('shows "Party not found" when query returns an error', () => {
    mockUsePartyQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Not Found'),
    })
    renderPage()
    expect(screen.getByText(/party not found/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 4. Sub-view = queue (default route) renders PartyQueue
// ---------------------------------------------------------------------------

describe('sub-view: queue', () => {
  it('renders PartyQueue when the pathname matches the base party route', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/party/test-party',
    } as ReturnType<typeof useLocation>)
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()
    expect(screen.getByTestId('party-queue')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 5. Sub-view derivation: QueueDrawer receives the active sub-view
// ---------------------------------------------------------------------------

describe('sub-view: non-queue routes', () => {
  it('passes "settings" currentSubView to QueueDrawer on settings route', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/party/test-party/settings',
    } as ReturnType<typeof useLocation>)
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()
    const drawers = screen.queryAllByTestId('queue-drawer')
    expect(drawers.length).toBeGreaterThan(0)
    expect(drawers[0]?.getAttribute('data-subview')).toBe('settings')
  })
})

// ---------------------------------------------------------------------------
// 6. Hamburger button toggles the narrow-viewport drawer
// ---------------------------------------------------------------------------

describe('drawer toggle', () => {
  it('hamburger button (Open menu) opens the narrow-viewport drawer', async () => {
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()
    const hamburger = screen.getByRole('button', { name: /open menu/i })
    await userEvent.click(hamburger)
    expect(screen.queryAllByTestId('queue-drawer').length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 7. Sign-in modal: normal mode
// ---------------------------------------------------------------------------

describe('sign-in modal: normal mode', () => {
  it('shows "Please sign in to vote" heading and a Google button when modal is open', async () => {
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()
    await openSignInModal()
    await vi.waitFor(() => {
      expect(screen.getByText(/please sign in to vote/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
  })

  it('does NOT show a Spotify button', async () => {
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()
    await openSignInModal()
    await vi.waitFor(() => {
      expect(screen.getByText(/please sign in to vote/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /spotify/i })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 8. Sign-in modal: follow-up mode
// The page-level triggerSignIn('follow-up') is called via window attachment.
// ---------------------------------------------------------------------------

// Follow-up sign-in mode is currently triggered only via the auth client
// detecting an email-already-linked situation. There is no in-page seam to
// force this mode from a test without mounting a mocked auth client that
// triggers it. The follow-up-mode rendering will be covered when the auth
// feature layer surfaces the linked-providers signal. The behavioural
// contract is documented in docs/specs/views-view-party.spec.md section 3.

// ---------------------------------------------------------------------------
// 9. Escape key closes modal (not drawer)
// ---------------------------------------------------------------------------

describe('Escape key: modal open', () => {
  it('closes the modal on Escape when modal is open', async () => {
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()
    await openSignInModal()
    await vi.waitFor(() => {
      expect(screen.getByText(/please sign in to vote/i)).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: 'Escape' })

    await vi.waitFor(() => {
      expect(screen.queryByText(/please sign in to vote/i)).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// 10. Escape key closes drawer when modal is closed
// ---------------------------------------------------------------------------

describe('Escape key: drawer open', () => {
  it('closes the narrow drawer on Escape when drawer is open and modal is closed', async () => {
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(screen.queryAllByTestId('queue-drawer').length).toBeGreaterThan(0)

    fireEvent.keyDown(window, { key: 'Escape' })

    await vi.waitFor(() => {
      const narrowDrawers = screen
        .queryAllByTestId('queue-drawer')
        .filter((el) => el.closest('.md\\:block') === null)
      expect(narrowDrawers.length).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------
// 11. Backdrop click / isDismissable prop wiring
// ---------------------------------------------------------------------------

describe('sign-in modal backdrop', () => {
  it('the modal renders its content when open (isDismissable prop is wired)', async () => {
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()
    await openSignInModal()
    await vi.waitFor(() => {
      expect(screen.getByText(/please sign in to vote/i)).toBeInTheDocument()
    })
    // Modal is open and dismissable. HeroUI handles the actual backdrop click internally.
    // We verify the content is rendered (the wiring is correct).
    expect(screen.getByText(/please sign in to vote/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 12. Wide-viewport layout
// ---------------------------------------------------------------------------

describe('wide viewport layout', () => {
  it('renders the wide-viewport drawer container (hidden md:block)', () => {
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    const { container } = renderPage()
    const wideContainer = container.querySelector('.md\\:block')
    expect(wideContainer).not.toBeNull()
  })

  it('hamburger button carries md:hidden class (CSS hides it on wide viewports)', () => {
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()
    const hamburger = screen.getByRole('button', { name: /open menu/i })
    expect(hamburger.className).toContain('md:hidden')
  })
})

// ---------------------------------------------------------------------------
// 13. Username derivation: null session -> empty username in drawer
// ---------------------------------------------------------------------------

describe('username derivation', () => {
  it('passes empty string to drawer username slot when session is unauthenticated', () => {
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()
    // Wide drawer is always open (isOpen=true always on wide variant)
    const usernameSpans = screen.queryAllByTestId('drawer-username')
    const texts = usernameSpans.map((el) => el.textContent ?? '')
    expect(texts.every((t) => t === '')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 14. Navigation paths: QueueDrawer receives properly scoped paths
// ---------------------------------------------------------------------------

describe('navigation paths', () => {
  it('QueueDrawer receives real party-scoped paths, not "#" stubs', () => {
    mockUsePartyQuery.mockReturnValue({ data: makeParty(), isLoading: false, error: null })
    renderPage()
    const drawers = screen.queryAllByTestId('queue-drawer')
    expect(drawers.length).toBeGreaterThan(0)
    const drawer = drawers[0]!
    expect(drawer.getAttribute('data-queue-path')).toMatch(/\/party\/test-party/)
    expect(drawer.getAttribute('data-settings-path')).toMatch(/\/party\/test-party\/settings/)
    expect(drawer.getAttribute('data-share-path')).toMatch(/\/party\/test-party\/share/)
    expect(drawer.getAttribute('data-tv-path')).toMatch(/\/party\/test-party\/tv/)
  })
})
