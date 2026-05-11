import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TestQueryProvider } from '@/shared/test/test-providers'
import { HomePage } from './HomePage'
import type { UseMutationResult } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: vi.fn(() => mockNavigate),
}))

vi.mock('../model/use-join-party', () => ({
  useJoinParty: vi.fn(),
}))

vi.mock('../model/use-create-party', () => ({
  useCreateParty: vi.fn(),
}))

vi.mock('../model/use-spotify-status-placeholder', () => ({
  useSpotifyStatusPlaceholder: vi.fn(() => ({
    isConnected: false,
    isPremium: false,
  })),
}))

vi.mock('@/shared/lib/use-playback-compatible', () => ({
  usePlaybackCompatible: vi.fn(() => false),
}))

vi.mock('@/shared/auth', () => ({
  getSession: vi.fn(),
  signInWithSocial: vi.fn(),
  authClient: {},
}))

// ---------------------------------------------------------------------------
// Imports after vi.mock (for mocked references)
// ---------------------------------------------------------------------------

import { useJoinParty } from '../model/use-join-party'
import { useCreateParty } from '../model/use-create-party'
import { useSpotifyStatusPlaceholder } from '../model/use-spotify-status-placeholder'
import { usePlaybackCompatible } from '@/shared/lib/use-playback-compatible'
import { getSession } from '@/shared/auth'
import type { JoinPartyResult } from '../model/use-join-party'
import type { CreatePartyResult } from '../model/use-create-party'

const mockUseJoinParty = vi.mocked(useJoinParty)
const mockUseCreateParty = vi.mocked(useCreateParty)
const mockUseSpotifyStatus = vi.mocked(useSpotifyStatusPlaceholder)
const mockUsePlaybackCompatible = vi.mocked(usePlaybackCompatible)
const mockGetSession = vi.mocked(getSession)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type JoinMutateFn = (
  vars: { partyCode: string },
  callbacks?: {
    onSuccess?: (result: JoinPartyResult) => void
    onError?: (err: Error) => void
  },
) => void

type CreateMutateFn = (
  vars: void,
  callbacks?: {
    onSuccess?: (result: CreatePartyResult) => void
    onError?: (err: Error) => void
  },
) => void

function makeJoinMutation(overrides: {
  isPending?: boolean
  mutateFn?: JoinMutateFn
}): UseMutationResult<JoinPartyResult, Error, { partyCode: string }, unknown> {
  return {
    mutate: overrides.mutateFn ?? vi.fn(),
    isPending: overrides.isPending ?? false,
    error: null,
  } as unknown as UseMutationResult<JoinPartyResult, Error, { partyCode: string }, unknown>
}

function makeCreateMutation(overrides: {
  isPending?: boolean
  mutateFn?: CreateMutateFn
}): UseMutationResult<CreatePartyResult, Error, void, unknown> {
  return {
    mutate: overrides.mutateFn ?? vi.fn(),
    isPending: overrides.isPending ?? false,
    error: null,
  } as unknown as UseMutationResult<CreatePartyResult, Error, void, unknown>
}

function renderPage() {
  return render(
    <TestQueryProvider>
      <HomePage />
    </TestQueryProvider>,
  )
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockNavigate.mockReset()
  mockUseJoinParty.mockReturnValue(makeJoinMutation({}))
  mockUseCreateParty.mockReturnValue(makeCreateMutation({}))
  mockUseSpotifyStatus.mockReturnValue({ isConnected: false, isPremium: false })
  mockUsePlaybackCompatible.mockReturnValue(false)
  // Default: unauthenticated session. Tests that want the authenticated
  // or pending paths override this in the test body.
  mockGetSession.mockResolvedValue(null)
})

// ---------------------------------------------------------------------------
// 1. Initial render
// ---------------------------------------------------------------------------

describe('initial render', () => {
  it('shows the CrowdTune wordmark', () => {
    renderPage()
    expect(screen.getByText('CrowdTune')).toBeInTheDocument()
  })

  it('shows the functional description', () => {
    renderPage()
    expect(
      screen.getByText(/let your crowd shape the soundtrack/i),
    ).toBeInTheDocument()
  })

  it('shows the party code input', () => {
    renderPage()
    expect(
      screen.getByRole('textbox', { name: /party code/i }),
    ).toBeInTheDocument()
  })

  it('Join Party button is disabled when input is empty', () => {
    renderPage()
    expect(
      screen.getByRole('button', { name: /join party/i }),
    ).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// 2. Party code input typing
// ---------------------------------------------------------------------------

describe('party code input', () => {
  it('Join Party button becomes enabled when input has a value', async () => {
    const user = userEvent.setup()
    renderPage()
    const input = screen.getByRole('textbox', { name: /party code/i })
    await user.type(input, '12345')
    expect(
      screen.getByRole('button', { name: /join party/i }),
    ).not.toBeDisabled()
  })

  it('Join Party button becomes disabled again when input is cleared', async () => {
    const user = userEvent.setup()
    renderPage()
    const input = screen.getByRole('textbox', { name: /party code/i })
    await user.type(input, '12345')
    await user.clear(input)
    expect(
      screen.getByRole('button', { name: /join party/i }),
    ).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// 3. Enter key on valid input fires join
// ---------------------------------------------------------------------------

describe('Enter key on valid input', () => {
  it('calls the join mutation on Enter when input is valid', async () => {
    const user = userEvent.setup()
    const mutateFn = vi.fn() as JoinMutateFn
    mockUseJoinParty.mockReturnValue(makeJoinMutation({ mutateFn }))
    renderPage()
    const input = screen.getByRole('textbox', { name: /party code/i })
    await user.type(input, '12345{Enter}')
    expect(mutateFn).toHaveBeenCalledWith(
      { partyCode: '12345' },
      expect.any(Object),
    )
  })
})

// ---------------------------------------------------------------------------
// 4. Join button click fires join mutation
// ---------------------------------------------------------------------------

describe('Join Party button click', () => {
  it('calls the join mutation when the button is clicked', async () => {
    const user = userEvent.setup()
    const mutateFn = vi.fn() as JoinMutateFn
    mockUseJoinParty.mockReturnValue(makeJoinMutation({ mutateFn }))
    renderPage()
    const input = screen.getByRole('textbox', { name: /party code/i })
    await user.type(input, '99999')
    await user.click(screen.getByRole('button', { name: /join party/i }))
    expect(mutateFn).toHaveBeenCalledWith(
      { partyCode: '99999' },
      expect.any(Object),
    )
  })
})

// ---------------------------------------------------------------------------
// 5. Join in-progress state
// ---------------------------------------------------------------------------

describe('join in-progress', () => {
  it('shows Joining... label and button + input are disabled', () => {
    mockUseJoinParty.mockReturnValue(makeJoinMutation({ isPending: true }))
    renderPage()
    expect(screen.getByRole('button', { name: /joining/i })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: /party code/i })).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// 6. Join success navigates to party page
// ---------------------------------------------------------------------------

describe('join success', () => {
  it('navigates to /party/<partyId> on success', async () => {
    const user = userEvent.setup()
    const mutateFn: JoinMutateFn = (_vars, cbs) => {
      cbs?.onSuccess?.({ partyId: 'ABC123' })
    }
    mockUseJoinParty.mockReturnValue(makeJoinMutation({ mutateFn }))
    renderPage()
    await user.type(
      screen.getByRole('textbox', { name: /party code/i }),
      'ABC123',
    )
    await user.click(screen.getByRole('button', { name: /join party/i }))
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/party/$partyId',
      params: { partyId: 'ABC123' },
    })
  })
})

// ---------------------------------------------------------------------------
// 7. Join failure shows inline error
// ---------------------------------------------------------------------------

describe('join failure', () => {
  it('shows inline error message below Join button on failure', async () => {
    const user = userEvent.setup()
    const mutateFn: JoinMutateFn = (_vars, cbs) => {
      cbs?.onError?.(new Error('not found'))
    }
    mockUseJoinParty.mockReturnValue(makeJoinMutation({ mutateFn }))
    renderPage()
    await user.type(
      screen.getByRole('textbox', { name: /party code/i }),
      'BADCODE',
    )
    await user.click(screen.getByRole('button', { name: /join party/i }))
    await waitFor(() => {
      expect(screen.getByText(/party not found/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// 8. Lower button: not authenticated -> sign-in
// ---------------------------------------------------------------------------

describe('lower button: not authenticated', () => {
  it('shows Sign in to create Party and navigates to /auth/$ on press', async () => {
    const user = userEvent.setup()
    mockUsePlaybackCompatible.mockReturnValue(true)
    mockUseSpotifyStatus.mockReturnValue({ isConnected: false, isPremium: false })
    mockGetSession.mockResolvedValue(null)
    renderPage()
    const btn = await screen.findByRole('button', { name: /sign in to create party/i })
    expect(btn).not.toBeDisabled()
    await user.click(btn)
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/auth/$',
      search: { redirectTo: '/' },
    })
  })
})

// ---------------------------------------------------------------------------
// 9. Lower button: connect-spotify variant
//
// Authenticated user without Spotify Premium connection shows the
// "Connect Spotify to create Party" button.
// ---------------------------------------------------------------------------

describe('lower button: connect-spotify', () => {
  it('shows Connect Spotify when authenticated but Spotify not Premium', async () => {
    mockUsePlaybackCompatible.mockReturnValue(true)
    mockUseSpotifyStatus.mockReturnValue({ isConnected: false, isPremium: false })
    mockGetSession.mockResolvedValue({
      id: 'u1',
      name: 'Alice',
      email: 'alice@example.com',
    })
    renderPage()
    expect(
      await screen.findByRole('button', { name: /connect spotify to create party/i }),
    ).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 10. Lower button: auth status unknown -> Checking...
//
// While the session query is pending, authState is 'unknown' and the
// lower button shows "Checking...". A never-resolving Promise keeps the
// query in flight long enough to assert on the initial render.
// ---------------------------------------------------------------------------

describe('lower button: auth unknown (checking)', () => {
  it('shows Checking... while the session query is in flight', () => {
    mockUsePlaybackCompatible.mockReturnValue(true)
    mockGetSession.mockImplementation(() => new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// 11. Lower button: authenticated + Premium -> Create Party
// ---------------------------------------------------------------------------

describe('lower button: authenticated + premium', () => {
  it('shows Create Party when authenticated and Spotify Premium is confirmed', async () => {
    mockUsePlaybackCompatible.mockReturnValue(true)
    mockUseSpotifyStatus.mockReturnValue({ isConnected: true, isPremium: true })
    mockGetSession.mockResolvedValue({
      id: 'u1',
      name: 'Alice',
      email: 'alice@example.com',
    })
    renderPage()
    expect(
      await screen.findByRole('button', { name: /create party/i }),
    ).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 12. Lower button: create in progress -> Creating...
// ---------------------------------------------------------------------------

describe('lower button: create in progress', () => {
  it('shows Creating... disabled button when create mutation is pending', () => {
    mockUsePlaybackCompatible.mockReturnValue(true)
    mockUseCreateParty.mockReturnValue(makeCreateMutation({ isPending: true }))
    renderPage()
    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// 13. Browser incompatibility: lower button absent, join form present
// ---------------------------------------------------------------------------

describe('browser incompatibility', () => {
  it('hides all lower button variants when browser is not playback-compatible', () => {
    mockUsePlaybackCompatible.mockReturnValue(false)
    renderPage()
    expect(screen.queryByRole('button', { name: /create party/i })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /sign in to create party/i }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: /checking/i })).toBeNull()
  })

  it('still renders the join form when browser is not compatible', () => {
    mockUsePlaybackCompatible.mockReturnValue(false)
    renderPage()
    expect(
      screen.getByRole('textbox', { name: /party code/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /join party/i }),
    ).toBeInTheDocument()
  })
})
