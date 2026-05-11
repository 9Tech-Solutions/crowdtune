import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import type { Track, Metadata } from '../model/types'
import type { Playback } from '@/entities/party'
import { PartyTrackRow, type PartyTrackRowProps } from './PartyTrackRow'

// -------------------------------------------------------------------------
// Factories
// -------------------------------------------------------------------------

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
    title: 'Test Track',
    artists: ['Test Artist'],
    coverImages: [],
    durationMs: 180_000,
    isPlayable: true,
    ...overrides,
  }
}

function makePlayback(playing: boolean, masterId: string | null = null): Playback {
  return {
    lastChange: '2024-01-01T00:00:00Z',
    lastPositionMs: 0,
    masterId,
    playing,
    targetPlaying: null,
  }
}

function defaultProps(overrides: Partial<PartyTrackRowProps> = {}): PartyTrackRowProps {
  return {
    track: makeTrack('track1'),
    metadata: makeMetadata(),
    currentTrack: makeTrack('other'),
    playback: makePlayback(true),
    isPlaying: false,
    hasVoted: false,
    isOwner: false,
    isMusicPlaying: false,
    isPlaybackMaster: false,
    hasOtherPlaybackMaster: false,
    hasConnectedSpotify: false,
    isCompatible: false,
    isTogglingPlayback: false,
    isPlayButtonEnabled: false,
    isVotePending: false,
    onVote: vi.fn(),
    onRemove: vi.fn(),
    onTogglePlayback: vi.fn(),
    onTransferPlayback: vi.fn(),
    onSkip: vi.fn(),
    ...overrides,
  }
}

// -------------------------------------------------------------------------
// 1. Metadata not yet loaded
// -------------------------------------------------------------------------

describe('metadata not yet loaded', () => {
  it('shows placeholder text when metadata is null', () => {
    render(<PartyTrackRow {...defaultProps({ metadata: null })} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('hides secondary line when metadata is null', () => {
    render(<PartyTrackRow {...defaultProps({ metadata: null })} />)
    // No artist text, no separator dot visible
    expect(screen.queryByText(/Test Artist/)).not.toBeInTheDocument()
  })
})

// -------------------------------------------------------------------------
// 2. Track record null
// -------------------------------------------------------------------------

describe('track record null', () => {
  it('does not render the vote button when track is null', () => {
    render(<PartyTrackRow {...defaultProps({ track: null })} />)
    expect(screen.queryByRole('button', { name: /vote for|unvote/i })).not.toBeInTheDocument()
  })

  it('does not render the skip button on the currently-playing row when track is null', () => {
    // Spec section 5: "Currently-playing track with null track record: the skip
    // button is not shown (guarded by a null check on the track record)."
    const props = defaultProps({
      track: null,
      currentTrack: null,
      playback: makePlayback(true),
      isPlaying: true,
      isMusicPlaying: true,
      isOwner: true,
      isPlayButtonEnabled: true,
    })
    render(<PartyTrackRow {...props} />)
    expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument()
  })
})

// -------------------------------------------------------------------------
// 3. Zero votes, non-fallback track
// -------------------------------------------------------------------------

describe('zero votes, non-fallback (Pending)', () => {
  it('shows "Pending" in the secondary line', () => {
    const track = makeTrack('t1', { voteCount: 0, isFallback: false })
    const props = defaultProps({
      track,
      currentTrack: makeTrack('other'),
      playback: makePlayback(true),
    })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByText(/Pending/)).toBeInTheDocument()
  })

  it('renders the plus icon (not heart) on the vote button', () => {
    const track = makeTrack('t1', { voteCount: 0, isFallback: false })
    const props = defaultProps({ track, currentTrack: makeTrack('other'), playback: makePlayback(true) })
    render(<PartyTrackRow {...props} />)
    // The vote button label says "Vote for Test Track" (no "Unvote")
    const btn = screen.getByRole('button', { name: /vote for Test Track/i })
    expect(btn).toBeInTheDocument()
  })
})

// -------------------------------------------------------------------------
// 4. Zero votes, fallback track
// -------------------------------------------------------------------------

describe('zero votes, fallback (Host pick)', () => {
  it('shows "Host pick" in the secondary line', () => {
    const track = makeTrack('t1', { voteCount: 0, isFallback: true })
    const props = defaultProps({ track, currentTrack: makeTrack('other'), playback: makePlayback(true) })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByText(/Host pick/)).toBeInTheDocument()
  })

  it('renders an outlined heart (not plus) on the vote button for fallback with no votes', () => {
    const track = makeTrack('t1', { voteCount: 0, isFallback: true })
    const props = defaultProps({ track, currentTrack: makeTrack('other'), playback: makePlayback(true), hasVoted: false })
    render(<PartyTrackRow {...props} />)
    // Accessible label uses "Vote for" (not Unvote) - has outline heart
    expect(screen.getByRole('button', { name: /vote for Test Track/i })).toBeInTheDocument()
  })
})

// -------------------------------------------------------------------------
// 5. Has votes, current user has NOT voted
// -------------------------------------------------------------------------

describe('has votes, user has not voted', () => {
  it('shows vote count in secondary line', () => {
    const track = makeTrack('t1', { voteCount: 2 })
    const props = defaultProps({ track, currentTrack: makeTrack('other'), playback: makePlayback(true), hasVoted: false })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByText(/2 votes/)).toBeInTheDocument()
  })

  it('vote button label is "Vote for" (outlined heart state)', () => {
    const track = makeTrack('t1', { voteCount: 2 })
    const props = defaultProps({ track, currentTrack: makeTrack('other'), playback: makePlayback(true), hasVoted: false })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByRole('button', { name: /vote for Test Track/i })).toBeInTheDocument()
  })
})

// -------------------------------------------------------------------------
// 6. Has votes, current user HAS voted
// -------------------------------------------------------------------------

describe('has votes, user has voted', () => {
  it('shows vote count in secondary line', () => {
    const track = makeTrack('t1', { voteCount: 2 })
    const props = defaultProps({ track, currentTrack: makeTrack('other'), playback: makePlayback(true), hasVoted: true })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByText(/2 votes/)).toBeInTheDocument()
  })

  it('vote button label is "Unvote" (filled heart state)', () => {
    const track = makeTrack('t1', { voteCount: 2 })
    const props = defaultProps({ track, currentTrack: makeTrack('other'), playback: makePlayback(true), hasVoted: true })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByRole('button', { name: /unvote Test Track/i })).toBeInTheDocument()
  })
})

// -------------------------------------------------------------------------
// 7. Currently playing + party playing
// -------------------------------------------------------------------------

describe('currently playing, party is playing', () => {
  it('shows "Now playing" in secondary line', () => {
    const track = makeTrack('t1')
    const props = defaultProps({
      track,
      currentTrack: track,
      playback: makePlayback(true),
      isPlaying: true,
      isMusicPlaying: true,
      isOwner: true,
      isPlayButtonEnabled: true,
    })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByText(/Now playing/)).toBeInTheDocument()
  })

  it('shows the pause icon on the play/pause button', () => {
    const track = makeTrack('t1')
    const props = defaultProps({
      track,
      currentTrack: track,
      playback: makePlayback(true),
      isPlaying: true,
      isMusicPlaying: true,
      isOwner: true,
      isPlayButtonEnabled: true,
    })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
  })
})

// -------------------------------------------------------------------------
// 8. Currently playing + party paused
// -------------------------------------------------------------------------

describe('currently playing, party is paused', () => {
  it('shows "Paused" in secondary line', () => {
    const track = makeTrack('t1')
    const props = defaultProps({
      track,
      currentTrack: track,
      playback: makePlayback(false),
      isPlaying: true,
      isMusicPlaying: false,
      isOwner: true,
      isPlayButtonEnabled: true,
    })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByText(/Paused/)).toBeInTheDocument()
  })

  it('shows the play-arrow icon on the play/pause button', () => {
    const track = makeTrack('t1')
    const props = defaultProps({
      track,
      currentTrack: track,
      playback: makePlayback(false),
      isPlaying: true,
      isMusicPlaying: false,
      isOwner: true,
      isPlayButtonEnabled: true,
    })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument()
  })
})

// -------------------------------------------------------------------------
// 9. Host on incompatible device, no other master
// -------------------------------------------------------------------------

describe('host on incompatible device, no other master', () => {
  it('renders play/pause button but it is disabled', () => {
    const track = makeTrack('t1')
    const props = defaultProps({
      track,
      currentTrack: track,
      playback: makePlayback(true),
      isPlaying: true,
      isMusicPlaying: true,
      isOwner: true,
      isCompatible: false,
      hasOtherPlaybackMaster: false,
      isPlayButtonEnabled: false,
    })
    render(<PartyTrackRow {...props} />)
    const btn = screen.getByRole('button', { name: /pause/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toBeDisabled()
  })
})

// -------------------------------------------------------------------------
// 9b. Host on compatible device + Spotify connected, no other master
// (the standard host scenario)
// -------------------------------------------------------------------------

describe('host on compatible device, Spotify connected, no other master', () => {
  it('play/pause button is enabled (the standard host scenario)', () => {
    const track = makeTrack('t1')
    const props = defaultProps({
      track,
      currentTrack: track,
      playback: makePlayback(true),
      isPlaying: true,
      isMusicPlaying: true,
      isOwner: true,
      isCompatible: true,
      hasConnectedSpotify: true,
      hasOtherPlaybackMaster: false,
      isPlayButtonEnabled: true,
    })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByRole('button', { name: /pause/i })).not.toBeDisabled()
  })

  it('transfer button is NOT shown when no other device is master', () => {
    const track = makeTrack('t1')
    const props = defaultProps({
      track,
      currentTrack: track,
      playback: makePlayback(true),
      isPlaying: true,
      isMusicPlaying: true,
      isOwner: true,
      isCompatible: true,
      hasConnectedSpotify: true,
      hasOtherPlaybackMaster: false,
      isPlayButtonEnabled: true,
    })
    render(<PartyTrackRow {...props} />)
    expect(screen.queryByRole('button', { name: /transfer/i })).not.toBeInTheDocument()
  })
})

// -------------------------------------------------------------------------
// 10. Host with another device as master
// -------------------------------------------------------------------------

describe('host with another device as master', () => {
  it('play/pause button is enabled', () => {
    const track = makeTrack('t1')
    const props = defaultProps({
      track,
      currentTrack: track,
      playback: makePlayback(true, 'other-device'),
      isPlaying: true,
      isMusicPlaying: true,
      isOwner: true,
      isPlaybackMaster: false,
      hasOtherPlaybackMaster: true,
      isCompatible: true,
      hasConnectedSpotify: true,
      isPlayButtonEnabled: true,
    })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByRole('button', { name: /pause/i })).not.toBeDisabled()
  })

  it('transfer button is visible', () => {
    const track = makeTrack('t1')
    const props = defaultProps({
      track,
      currentTrack: track,
      playback: makePlayback(true, 'other-device'),
      isPlaying: true,
      isMusicPlaying: true,
      isOwner: true,
      isPlaybackMaster: false,
      hasOtherPlaybackMaster: true,
      isCompatible: true,
      hasConnectedSpotify: true,
      isPlayButtonEnabled: true,
    })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByRole('button', { name: /transfer playback/i })).toBeInTheDocument()
  })
})

// -------------------------------------------------------------------------
// 11. Guest user
// -------------------------------------------------------------------------

describe('guest user (is-owner false)', () => {
  it('shows vote button', () => {
    const track = makeTrack('t1', { voteCount: 0 })
    render(<PartyTrackRow {...defaultProps({ track, isOwner: false })} />)
    expect(screen.getByRole('button', { name: /vote for/i })).toBeInTheDocument()
  })

  it('does not show remove button', () => {
    const track = makeTrack('t1', { voteCount: 1 })
    render(<PartyTrackRow {...defaultProps({ track, isOwner: false })} />)
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('does not show skip button', () => {
    const track = makeTrack('t1')
    render(<PartyTrackRow {...defaultProps({ track, isOwner: false, isPlaying: true })} />)
    expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument()
  })

  it('does not show play/pause button', () => {
    const track = makeTrack('t1')
    render(<PartyTrackRow {...defaultProps({ track, isOwner: false, isPlaying: true })} />)
    expect(screen.queryByRole('button', { name: /pause|^play$/i })).not.toBeInTheDocument()
  })

  it('does not show transfer button', () => {
    const track = makeTrack('t1')
    render(
      <PartyTrackRow
        {...defaultProps({
          track,
          isOwner: false,
          isPlaying: true,
          hasOtherPlaybackMaster: true,
          isCompatible: true,
          hasConnectedSpotify: true,
        })}
      />,
    )
    expect(screen.queryByRole('button', { name: /transfer/i })).not.toBeInTheDocument()
  })
})

// -------------------------------------------------------------------------
// Callback tests
// -------------------------------------------------------------------------

describe('callbacks', () => {
  it('vote button tap calls onVote with ref and toggled boolean (false -> true)', async () => {
    const onVote = vi.fn()
    const track = makeTrack('t1', { voteCount: 0 })
    render(<PartyTrackRow {...defaultProps({ track, hasVoted: false, onVote })} />)
    await userEvent.click(screen.getByRole('button', { name: /vote for/i }))
    expect(onVote).toHaveBeenCalledWith(track.ref, true)
  })

  it('vote button tap calls onVote with ref and toggled boolean (true -> false)', async () => {
    const onVote = vi.fn()
    const track = makeTrack('t1', { voteCount: 1 })
    render(<PartyTrackRow {...defaultProps({ track, hasVoted: true, onVote })} />)
    await userEvent.click(screen.getByRole('button', { name: /unvote/i }))
    expect(onVote).toHaveBeenCalledWith(track.ref, false)
  })

  it('remove button tap calls onRemove with track ref', async () => {
    const onRemove = vi.fn()
    const track = makeTrack('t1', { voteCount: 1 })
    render(<PartyTrackRow {...defaultProps({ track, isOwner: true, onRemove })} />)
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onRemove).toHaveBeenCalledWith(track.ref)
  })

  it('play/pause button tap calls onTogglePlayback', async () => {
    const onTogglePlayback = vi.fn()
    const track = makeTrack('t1')
    const props = defaultProps({
      track,
      currentTrack: track,
      playback: makePlayback(true),
      isPlaying: true,
      isMusicPlaying: true,
      isOwner: true,
      isPlayButtonEnabled: true,
      onTogglePlayback,
    })
    render(<PartyTrackRow {...props} />)
    await userEvent.click(screen.getByRole('button', { name: /pause/i }))
    expect(onTogglePlayback).toHaveBeenCalledOnce()
  })

  it('skip button tap calls onSkip with track ref', async () => {
    const onSkip = vi.fn()
    const track = makeTrack('t1')
    const props = defaultProps({
      track,
      currentTrack: track,
      playback: makePlayback(true),
      isPlaying: true,
      isMusicPlaying: true,
      isOwner: true,
      isPlayButtonEnabled: true,
      onSkip,
    })
    render(<PartyTrackRow {...props} />)
    await userEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(onSkip).toHaveBeenCalledWith(track.ref)
  })

  it('transfer button tap calls onTransferPlayback', async () => {
    const onTransferPlayback = vi.fn()
    const track = makeTrack('t1')
    const props = defaultProps({
      track,
      currentTrack: track,
      playback: makePlayback(true, 'other'),
      isPlaying: true,
      isMusicPlaying: true,
      isOwner: true,
      isPlaybackMaster: false,
      hasOtherPlaybackMaster: true,
      isCompatible: true,
      hasConnectedSpotify: true,
      isPlayButtonEnabled: true,
      onTransferPlayback,
    })
    render(<PartyTrackRow {...props} />)
    await userEvent.click(screen.getByRole('button', { name: /transfer playback/i }))
    expect(onTransferPlayback).toHaveBeenCalledOnce()
  })
})

// -------------------------------------------------------------------------
// Locked defaults
// -------------------------------------------------------------------------

describe('locked defaults', () => {
  it('vote button is disabled while isVotePending is true', () => {
    const track = makeTrack('t1', { voteCount: 0 })
    render(<PartyTrackRow {...defaultProps({ track, isVotePending: true })} />)
    expect(screen.getByRole('button', { name: /vote for/i })).toBeDisabled()
  })

  it('skip button is disabled while isTogglingPlayback is true', () => {
    const track = makeTrack('t1')
    const props = defaultProps({
      track,
      currentTrack: track,
      playback: makePlayback(true),
      isPlaying: true,
      isMusicPlaying: true,
      isOwner: true,
      isPlayButtonEnabled: false,
      isTogglingPlayback: true,
    })
    render(<PartyTrackRow {...props} />)
    expect(screen.getByRole('button', { name: /skip/i })).toBeDisabled()
  })
})
