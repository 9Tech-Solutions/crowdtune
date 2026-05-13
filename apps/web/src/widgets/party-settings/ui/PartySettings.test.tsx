/**
 * Tests for the PartySettings widget.
 *
 * Strategy: mock the four API hooks and TanStack Router at the module level,
 * pre-seed the TanStack Query cache with a party record, and assert on
 * visible output. The vi.mock hoisting ensures the modules are replaced
 * before any import of the widget under test.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Party } from '@/entities/party'
import type { PartySettings as PartySettingsType } from '@/entities/party'
import type { Playlist } from '@/entities/playlist'

// ---------------------------------------------------------------------------
// Shared mutable mock state — mutated in beforeEach per describe block.
// ---------------------------------------------------------------------------

const mockMutateUpdate = vi.fn()
const mockMutateUpdateName = vi.fn()
const mockMutateFlush = vi.fn()
const mockMutateInsert = vi.fn()

// Hoisted mock modules

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ partyId: 'party-abc' }),
}))

vi.mock('../api/use-update-party-settings', () => ({
  useUpdatePartySettings: vi.fn(() => ({
    mutate: mockMutateUpdate,
    isPending: false,
    isError: false,
  })),
}))

vi.mock('../api/use-update-party-name', () => ({
  useUpdatePartyName: vi.fn(() => ({
    mutate: mockMutateUpdateName,
    isPending: false,
    isError: false,
  })),
}))

vi.mock('../api/use-flush-queue', () => ({
  useFlushQueue: vi.fn(() => ({
    mutate: mockMutateFlush,
    isPending: false,
  })),
}))

vi.mock('../api/use-insert-playlist', () => ({
  useInsertPlaylist: vi.fn(() => ({
    mutate: mockMutateInsert,
    isPending: false,
  })),
}))

vi.mock('../api/use-host-playlists', () => ({
  useHostPlaylists: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
  })),
}))

vi.mock('@/shared/auth', () => ({
  getSession: vi.fn(() =>
    Promise.resolve({ id: 'host-user-1', name: 'Host', email: 'h@ex.com' }),
  ),
}))

// Import AFTER mocks are registered
import { PartySettings } from './PartySettings'
import { useUpdatePartySettings } from '../api/use-update-party-settings'
import { useUpdatePartyName } from '../api/use-update-party-name'
import { useFlushQueue } from '../api/use-flush-queue'
import { useInsertPlaylist } from '../api/use-insert-playlist'
import { useHostPlaylists } from '../api/use-host-playlists'
import { getSession } from '@/shared/auth'

// ---------------------------------------------------------------------------
// Mock reset helper - resets to the initial mock state defined in vi.mock
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeSettings(overrides: Partial<PartySettingsType> = {}): PartySettingsType {
  return {
    allowAnonymousVoting: true,
    allowExplicitTracks: true,
    allowMultipleVotesPerSearch: true,
    tvDisplayText: 'Join the queue at crowdtune.app',
    maxTrackLengthMinutes: null,
    ...overrides,
  }
}

function makeParty(overrides: Partial<Party> = {}): Party {
  return {
    id: 'party-abc',
    shortId: 'party-abc',
    name: 'My Test Party',
    countryCode: 'US',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    hostUserId: 'host-user-1',
    isActive: true,
    playback: {
      lastChange: '2026-01-01T00:00:00Z',
      lastPositionMs: 0,
      masterId: null,
      playing: false,
      targetPlaying: null,
    },
    settings: makeSettings(),
    ...overrides,
  }
}

function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    name: 'Test Playlist',
    ref: { id: 'playlist-1', provider: 'spotify', spotifyUserId: 'u' },
    trackCount: 42,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

let currentSessionUserId = 'host-user-1'

function renderWidget(party: Party | null = makeParty()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  if (party !== null) {
    client.setQueryData(['party', 'party-abc'], party)
  }

  client.setQueryData(
    ['session'],
    currentSessionUserId
      ? { id: currentSessionUserId, name: 'Host', email: 'h@ex.com' }
      : null,
  )

  return render(
    <QueryClientProvider client={client}>
      <PartySettings />
    </QueryClientProvider>,
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Castable = (...args: any[]) => any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setMock<F extends Castable>(fn: F, value: any) {
  vi.mocked(fn).mockReturnValue(value as ReturnType<F>)
}

function resetDefaultMocks() {
  setMock(useUpdatePartySettings, {
    mutate: mockMutateUpdate,
    isPending: false,
    isError: false,
  })
  setMock(useUpdatePartyName, {
    mutate: mockMutateUpdateName,
    isPending: false,
    isError: false,
  })
  setMock(useFlushQueue, {
    mutate: mockMutateFlush,
    isPending: false,
  })
  setMock(useInsertPlaylist, {
    mutate: mockMutateInsert,
    isPending: false,
  })
  setMock(useHostPlaylists, {
    data: undefined,
    isLoading: false,
    isError: false,
  })
  setMock(getSession, Promise.resolve(
    currentSessionUserId
      ? { id: currentSessionUserId, name: 'Host', email: 'h@ex.com' }
      : null,
  ))
}

// ---------------------------------------------------------------------------
// 1. Host-gating: non-host sees unauthorized message
// ---------------------------------------------------------------------------

describe('host-gating', () => {
  beforeEach(() => {
    currentSessionUserId = 'guest-user'
    resetDefaultMocks()
    mockMutateUpdate.mockClear()
  })

  afterEach(() => {
    currentSessionUserId = 'host-user-1'
  })

  it('renders the unauthorized message when user is not the host', () => {
    renderWidget()
    expect(
      screen.getByText(/only the party host can access settings/i),
    ).toBeInTheDocument()
  })

  it('does not render the General Settings heading for a non-host', () => {
    renderWidget()
    expect(screen.queryByText('General Settings')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 2. Initial render: settings groups and toggles visible
// ---------------------------------------------------------------------------

describe('initial render', () => {
  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
  })

  it('renders the General Settings panel heading', () => {
    renderWidget()
    expect(screen.getByText('General Settings')).toBeInTheDocument()
  })

  it('renders the Fallback Playlist panel heading', () => {
    renderWidget()
    expect(screen.getByText('Fallback Playlist')).toBeInTheDocument()
  })

  it('renders the Party Name input with the current party name', () => {
    renderWidget(makeParty({ name: 'Awesome Party' }))
    expect(screen.getByRole('textbox', { name: /party name/i })).toHaveValue('Awesome Party')
  })

  it('renders the TV Display Text input', () => {
    renderWidget()
    expect(screen.getByRole('textbox', { name: /tv display text/i })).toBeInTheDocument()
  })

  it('renders all three toggle switches', () => {
    renderWidget()
    expect(screen.getByRole('switch', { name: /keep search open after adding/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /allow explicit tracks/i })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /require sign-in to vote/i })).toBeInTheDocument()
  })

  it('reflects allowMultipleVotesPerSearch=true as toggle checked', () => {
    renderWidget(makeParty({ settings: makeSettings({ allowMultipleVotesPerSearch: true }) }))
    expect(
      screen.getByRole('switch', { name: /keep search open after adding/i }),
    ).toBeChecked()
  })

  it('reflects allowExplicitTracks=false as toggle unchecked', () => {
    renderWidget(makeParty({ settings: makeSettings({ allowExplicitTracks: false }) }))
    expect(
      screen.getByRole('switch', { name: /allow explicit tracks/i }),
    ).not.toBeChecked()
  })

  it('requireSignIn toggle is ON when allowAnonymousVoting=false (inverted polarity)', () => {
    renderWidget(makeParty({ settings: makeSettings({ allowAnonymousVoting: false }) }))
    expect(
      screen.getByRole('switch', { name: /require sign-in to vote/i }),
    ).toBeChecked()
  })
})

// ---------------------------------------------------------------------------
// 3. Toggle flip: mutate is called with updated settings
// ---------------------------------------------------------------------------

describe('toggle flip', () => {
  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
    mockMutateUpdate.mockClear()
  })

  it('calls mutate with allowMultipleVotesPerSearch=false when toggle flipped from on', async () => {
    renderWidget(makeParty({ settings: makeSettings({ allowMultipleVotesPerSearch: true }) }))
    await userEvent.click(screen.getByRole('switch', { name: /keep search open after adding/i }))
    expect(mockMutateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ allowMultipleVotesPerSearch: false }),
      expect.any(Object),
    )
  })

  it('calls mutate with allowExplicitTracks=false when toggle flipped from on', async () => {
    renderWidget(makeParty({ settings: makeSettings({ allowExplicitTracks: true }) }))
    await userEvent.click(screen.getByRole('switch', { name: /allow explicit tracks/i }))
    expect(mockMutateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ allowExplicitTracks: false }),
      expect.any(Object),
    )
  })

  it('calls mutate with allowAnonymousVoting=false when require-sign-in turned ON', async () => {
    renderWidget(makeParty({ settings: makeSettings({ allowAnonymousVoting: true }) }))
    await userEvent.click(screen.getByRole('switch', { name: /require sign-in to vote/i }))
    expect(mockMutateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ allowAnonymousVoting: false }),
      expect.any(Object),
    )
  })
})

// ---------------------------------------------------------------------------
// 4 & 5. Text / number field blur handlers
// ---------------------------------------------------------------------------

describe('text field blur', () => {
  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
    mockMutateUpdate.mockClear()
    mockMutateUpdateName.mockClear()
  })

  it('does NOT call mutate when party name blurs with unchanged value', () => {
    renderWidget(makeParty({ name: 'Same Name' }))
    const input = screen.getByRole('textbox', { name: /party name/i })
    fireEvent.blur(input)
    expect(mockMutateUpdateName).not.toHaveBeenCalled()
  })

  it('calls update-party-name mutate when party name blurs with a new value', () => {
    renderWidget(makeParty({ name: 'Old Name' }))
    const input = screen.getByRole('textbox', { name: /party name/i })
    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.blur(input)
    expect(mockMutateUpdateName).toHaveBeenCalledWith(
      'New Name',
      expect.any(Object),
    )
  })

  it('does NOT call update-party-name when party name blurs empty (validation error)', () => {
    renderWidget(makeParty({ name: 'Some Name' }))
    const input = screen.getByRole('textbox', { name: /party name/i })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(mockMutateUpdateName).not.toHaveBeenCalled()
  })

  it('calls mutate when TV display text blurs with a new value', () => {
    renderWidget(makeParty({ settings: makeSettings({ tvDisplayText: 'old text' }) }))
    const input = screen.getByRole('textbox', { name: /tv display text/i })
    fireEvent.change(input, { target: { value: 'new text' } })
    fireEvent.blur(input)
    expect(mockMutateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ tvDisplayText: 'new text' }),
      expect.any(Object),
    )
  })
})

describe('number field', () => {
  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
    mockMutateUpdate.mockClear()
  })

  it('sends maxTrackLengthMinutes=null when the field is cleared to blank', () => {
    renderWidget(makeParty({ settings: makeSettings({ maxTrackLengthMinutes: 5 }) }))
    const input = screen.getByRole('spinbutton', { name: /maximum track length/i })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(mockMutateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ maxTrackLengthMinutes: null }),
      expect.any(Object),
    )
  })

  it('shows a validation error for a non-positive value and does not call mutate', () => {
    renderWidget(makeParty({ settings: makeSettings({ maxTrackLengthMinutes: null }) }))
    const input = screen.getByRole('spinbutton', { name: /maximum track length/i })
    fireEvent.change(input, { target: { value: '-1' } })
    fireEvent.blur(input)
    expect(
      screen.getByText(/track length must be a whole number greater than zero/i),
    ).toBeInTheDocument()
    expect(mockMutateUpdate).not.toHaveBeenCalled()
  })

  it('calls mutate with a valid positive integer', () => {
    renderWidget(makeParty({ settings: makeSettings({ maxTrackLengthMinutes: null }) }))
    const input = screen.getByRole('spinbutton', { name: /maximum track length/i })
    fireEvent.change(input, { target: { value: '10' } })
    fireEvent.blur(input)
    expect(mockMutateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ maxTrackLengthMinutes: 10 }),
      expect.any(Object),
    )
  })
})

// ---------------------------------------------------------------------------
// 6. Save failure: console.warn is called via onError
// ---------------------------------------------------------------------------

describe('save failure fallback', () => {
  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
    mockMutateUpdate.mockClear()
  })

  it('calls console.warn when the mutation fires its onError callback', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Make mutate immediately call onError
    vi.mocked(useUpdatePartySettings).mockImplementation(() => ({
      mutate: ((_: unknown, opts: { onError: () => void }) => opts.onError()) as unknown as ReturnType<typeof useUpdatePartySettings>['mutate'],
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof useUpdatePartySettings>))

    renderWidget(makeParty({ settings: makeSettings({ allowExplicitTracks: true }) }))
    await userEvent.click(screen.getByRole('switch', { name: /allow explicit tracks/i }))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not save settings'))
    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// 7. Flush queue: button opens modal, confirm fires mutate
// ---------------------------------------------------------------------------

describe('flush queue modal', () => {
  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
    mockMutateFlush.mockClear()
  })

  it('renders the Flush Queue button', () => {
    renderWidget()
    expect(screen.getByRole('button', { name: /flush queue/i })).toBeInTheDocument()
  })

  it('opens the confirmation dialog when Flush Queue is pressed', async () => {
    renderWidget()
    await userEvent.click(screen.getByRole('button', { name: /flush queue/i }))
    await waitFor(() => expect(screen.getByText('Flush queue?')).toBeInTheDocument())
  })

  it('calls useFlushQueue.mutate when the Flush confirm button is pressed', async () => {
    renderWidget()
    await userEvent.click(screen.getByRole('button', { name: /flush queue/i }))
    await waitFor(() => screen.getByText('Flush queue?'))
    await userEvent.click(screen.getByRole('button', { name: /^flush$/i }))
    expect(mockMutateFlush).toHaveBeenCalled()
  })

  it('closes the modal without calling mutate when Cancel is pressed', async () => {
    renderWidget()
    await userEvent.click(screen.getByRole('button', { name: /flush queue/i }))
    await waitFor(() => screen.getByText('Flush queue?'))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByText('Flush queue?')).not.toBeInTheDocument())
    expect(mockMutateFlush).not.toHaveBeenCalled()
  })

  it('closes the modal when Escape is pressed', async () => {
    renderWidget()
    await userEvent.click(screen.getByRole('button', { name: /flush queue/i }))
    await waitFor(() => screen.getByText('Flush queue?'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Flush queue?')).not.toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// 8. Spotify not connected: Connect CTA renders
// ---------------------------------------------------------------------------

describe('Spotify not connected', () => {
  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
  })

  it('renders the Connect with Spotify button', () => {
    renderWidget()
    expect(screen.getByRole('button', { name: /connect with spotify/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 9. PlaylistPanel directly: connected + no playlists shows empty-state
// ---------------------------------------------------------------------------

describe('Spotify connected, no playlists', () => {
  it('shows the no-playlists empty-state when host has no Spotify playlists', async () => {
    const { PlaylistPanel } = await import('./PlaylistPanel')
    render(
      <PlaylistPanel
        isSpotifyConnected={true}
        isSpotifyAuthInProgress={false}
        playlists={[]}
        isPlaylistsLoading={false}
        isInsertPending={false}
        playlistFilter=""
        onFilterChange={() => {}}
        onConnectSpotify={() => {}}
        onInsertPlaylist={vi.fn()}
      />,
    )
    expect(
      screen.getByText(/no playlists found in your spotify account/i),
    ).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 10. PlaylistPanel filter: typing filters the list client-side
// ---------------------------------------------------------------------------

describe('playlist filter', () => {
  it('shows all playlists when filter is empty', async () => {
    const { PlaylistPanel } = await import('./PlaylistPanel')
    render(
      <PlaylistPanel
        isSpotifyConnected={true}
        isSpotifyAuthInProgress={false}
        playlists={[
          makePlaylist({ name: 'Chill Vibes', ref: { id: 'p1', provider: 'spotify', spotifyUserId: 'u' } }),
          makePlaylist({ name: 'Rock Classics', ref: { id: 'p2', provider: 'spotify', spotifyUserId: 'u' } }),
        ]}
        isPlaylistsLoading={false}
        isInsertPending={false}
        playlistFilter=""
        onFilterChange={() => {}}
        onConnectSpotify={() => {}}
        onInsertPlaylist={vi.fn()}
      />,
    )
    expect(screen.getByText('Chill Vibes')).toBeInTheDocument()
    expect(screen.getByText('Rock Classics')).toBeInTheDocument()
  })

  it('hides non-matching playlists when filter is applied', async () => {
    const { PlaylistPanel } = await import('./PlaylistPanel')
    render(
      <PlaylistPanel
        isSpotifyConnected={true}
        isSpotifyAuthInProgress={false}
        playlists={[
          makePlaylist({ name: 'Chill Vibes', ref: { id: 'p1', provider: 'spotify', spotifyUserId: 'u' } }),
          makePlaylist({ name: 'Rock Classics', ref: { id: 'p2', provider: 'spotify', spotifyUserId: 'u' } }),
        ]}
        isPlaylistsLoading={false}
        isInsertPending={false}
        playlistFilter="rock"
        onFilterChange={() => {}}
        onConnectSpotify={() => {}}
        onInsertPlaylist={vi.fn()}
      />,
    )
    expect(screen.queryByText('Chill Vibes')).not.toBeInTheDocument()
    expect(screen.getByText('Rock Classics')).toBeInTheDocument()
  })

  it('shows no-match message when filter yields no results', async () => {
    const { PlaylistPanel } = await import('./PlaylistPanel')
    render(
      <PlaylistPanel
        isSpotifyConnected={true}
        isSpotifyAuthInProgress={false}
        playlists={[makePlaylist({ name: 'Chill Vibes' })]}
        isPlaylistsLoading={false}
        isInsertPending={false}
        playlistFilter="zzznomatch"
        onFilterChange={() => {}}
        onConnectSpotify={() => {}}
        onInsertPlaylist={vi.fn()}
      />,
    )
    expect(screen.getByText(/no playlists match your search/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 11. Insert in order
// ---------------------------------------------------------------------------

describe('insert in order', () => {
  it('calls onInsertPlaylist with shuffle=false', async () => {
    const { PlaylistPanel } = await import('./PlaylistPanel')
    const onInsert = vi.fn()
    const playlist = makePlaylist({ name: 'Evening Mix' })

    render(
      <PlaylistPanel
        isSpotifyConnected={true}
        isSpotifyAuthInProgress={false}
        playlists={[playlist]}
        isPlaylistsLoading={false}
        isInsertPending={false}
        playlistFilter=""
        onFilterChange={() => {}}
        onConnectSpotify={() => {}}
        onInsertPlaylist={onInsert}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /add evening mix in order/i }))
    expect(onInsert).toHaveBeenCalledWith(playlist.ref, false)
  })
})

// ---------------------------------------------------------------------------
// 12. Insert shuffled
// ---------------------------------------------------------------------------

describe('insert shuffled', () => {
  it('calls onInsertPlaylist with shuffle=true', async () => {
    const { PlaylistPanel } = await import('./PlaylistPanel')
    const onInsert = vi.fn()
    const playlist = makePlaylist({ name: 'Evening Mix' })

    render(
      <PlaylistPanel
        isSpotifyConnected={true}
        isSpotifyAuthInProgress={false}
        playlists={[playlist]}
        isPlaylistsLoading={false}
        isInsertPending={false}
        playlistFilter=""
        onFilterChange={() => {}}
        onConnectSpotify={() => {}}
        onInsertPlaylist={onInsert}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /shuffle and add evening mix/i }))
    expect(onInsert).toHaveBeenCalledWith(playlist.ref, true)
  })
})

// ---------------------------------------------------------------------------
// 13. Accessibility spot-checks
// ---------------------------------------------------------------------------

describe('accessibility', () => {
  beforeEach(() => {
    currentSessionUserId = 'host-user-1'
    resetDefaultMocks()
  })

  it('Flush Queue button has the descriptive aria-label', () => {
    renderWidget()
    expect(
      screen.getByRole('button', { name: /flush queue/i }),
    ).toHaveAttribute(
      'aria-label',
      'Flush queue - removes all tracks except the currently playing one',
    )
  })

  it('Filter input has aria-label="Filter playlists"', async () => {
    const { PlaylistPanel } = await import('./PlaylistPanel')
    render(
      <PlaylistPanel
        isSpotifyConnected={true}
        isSpotifyAuthInProgress={false}
        playlists={[]}
        isPlaylistsLoading={false}
        isInsertPending={false}
        playlistFilter=""
        onFilterChange={() => {}}
        onConnectSpotify={() => {}}
        onInsertPlaylist={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('textbox', { name: /filter playlists/i }),
    ).toHaveAttribute('aria-label', 'Filter playlists')
  })

  it('Playlist list region has role=region and aria-label="Spotify playlists"', async () => {
    const { PlaylistPanel } = await import('./PlaylistPanel')
    render(
      <PlaylistPanel
        isSpotifyConnected={true}
        isSpotifyAuthInProgress={false}
        playlists={[]}
        isPlaylistsLoading={false}
        isInsertPending={false}
        playlistFilter=""
        onFilterChange={() => {}}
        onConnectSpotify={() => {}}
        onInsertPlaylist={vi.fn()}
      />,
    )
    expect(screen.getByRole('region', { name: /spotify playlists/i })).toBeInTheDocument()
  })

  it('Confirmation dialog has aria-label', async () => {
    renderWidget()
    await userEvent.click(screen.getByRole('button', { name: /flush queue/i }))
    await waitFor(() => screen.getByText('Flush queue?'))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-label', 'Confirm flush queue')
  })
})
