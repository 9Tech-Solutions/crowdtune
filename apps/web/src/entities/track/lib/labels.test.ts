import { describe, it, expect } from 'vitest'
import { formatArtists, voteStatusLabel } from './labels'
import type { Track, Metadata } from '../model/types'
import type { Playback } from '@/entities/party'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrack(id: string, overrides: Partial<Track> = {}): Track {
  return {
    ref: { provider: 'spotify', id },
    addedAt: '2024-01-01T00:00:00.000Z',
    isFallback: false,
    voteCount: 0,
    order: 0,
    ...overrides,
  }
}

function makeMetadata(artists: string[]): Metadata {
  return {
    title: 'Test',
    artists,
    coverImages: [],
    durationMs: 180_000,
    isPlayable: true,
  }
}

function makePlayback(playing: boolean): Playback {
  return {
    lastChange: '2024-01-01T00:00:00.000Z',
    lastPositionMs: 0,
    masterId: null,
    playing,
    targetPlaying: null,
  }
}

// ---------------------------------------------------------------------------
// formatArtists
// ---------------------------------------------------------------------------

describe('formatArtists', () => {
  it('returns null when metadata is null', () => {
    expect(formatArtists(null)).toBeNull()
  })

  it('returns null when metadata is undefined', () => {
    expect(formatArtists(undefined)).toBeNull()
  })

  it('returns null when artists array is empty', () => {
    expect(formatArtists(makeMetadata([]))).toBeNull()
  })

  it('returns the artist name alone for a single artist', () => {
    expect(formatArtists(makeMetadata(['Adele']))).toBe('Adele')
  })

  it('formats two artists with "feat." pattern', () => {
    expect(formatArtists(makeMetadata(['Jay-Z', 'Alicia Keys']))).toBe('Jay-Z feat. Alicia Keys')
  })

  it('joins three or more remaining artists with " & "', () => {
    expect(formatArtists(makeMetadata(['Eminem', 'Dr. Dre', '50 Cent']))).toBe(
      'Eminem feat. Dr. Dre & 50 Cent',
    )
  })

  it('first artist is never in the & join group', () => {
    const result = formatArtists(makeMetadata(['A', 'B', 'C', 'D']))
    expect(result).toBe('A feat. B & C & D')
  })
})

// ---------------------------------------------------------------------------
// voteStatusLabel
// ---------------------------------------------------------------------------

describe('voteStatusLabel', () => {
  const playing = makePlayback(true)
  const paused = makePlayback(false)

  it('returns empty string when track is null', () => {
    const t = makeTrack('x')
    expect(voteStatusLabel({ track: null, currentTrack: t, playback: playing })).toBe('')
  })

  it('returns empty string when track is undefined', () => {
    const t = makeTrack('x')
    expect(voteStatusLabel({ track: undefined, currentTrack: t, playback: playing })).toBe('')
  })

  it('returns empty string when playback is null', () => {
    const t = makeTrack('x')
    expect(voteStatusLabel({ track: t, currentTrack: t, playback: null })).toBe('')
  })

  it('returns empty string when playback is undefined', () => {
    const t = makeTrack('x')
    expect(voteStatusLabel({ track: t, currentTrack: t, playback: undefined })).toBe('')
  })

  it('returns "Now playing" when track is current and playback.playing is true', () => {
    const t = makeTrack('current', { voteCount: 5 })
    expect(voteStatusLabel({ track: t, currentTrack: t, playback: playing })).toBe('Now playing')
  })

  it('returns "Paused" when track is current and playback.playing is false', () => {
    const t = makeTrack('current', { voteCount: 3 })
    expect(voteStatusLabel({ track: t, currentTrack: t, playback: paused })).toBe('Paused')
  })

  it('playback state wins over vote count for current track', () => {
    // Even with 10 votes, current track shows playback state
    const t = makeTrack('current', { voteCount: 10 })
    expect(voteStatusLabel({ track: t, currentTrack: t, playback: playing })).toBe('Now playing')
  })

  it('returns "${N} votes" when voteCount > 1 and not current', () => {
    const t = makeTrack('other', { voteCount: 5 })
    const c = makeTrack('current')
    expect(voteStatusLabel({ track: t, currentTrack: c, playback: playing })).toBe('5 votes')
  })

  it('returns "1 vote" when voteCount === 1 (singular form)', () => {
    const t = makeTrack('other', { voteCount: 1 })
    const c = makeTrack('current')
    expect(voteStatusLabel({ track: t, currentTrack: c, playback: playing })).toBe('1 vote')
  })

  it('returns "Host pick" when voteCount === 0 and isFallback is true', () => {
    const t = makeTrack('fallback', { voteCount: 0, isFallback: true })
    const c = makeTrack('current')
    expect(voteStatusLabel({ track: t, currentTrack: c, playback: playing })).toBe('Host pick')
  })

  it('returns "Pending" when voteCount === 0 and isFallback is false', () => {
    const t = makeTrack('pending', { voteCount: 0, isFallback: false })
    const c = makeTrack('current')
    expect(voteStatusLabel({ track: t, currentTrack: c, playback: playing })).toBe('Pending')
  })

  it('vote count takes priority over fallback flag (voteCount > 0 wins)', () => {
    // A fallback track that has received a vote should show vote count
    const t = makeTrack('voted-fallback', { voteCount: 2, isFallback: true })
    const c = makeTrack('current')
    expect(voteStatusLabel({ track: t, currentTrack: c, playback: playing })).toBe('2 votes')
  })

  it('returns empty string when queue is empty (no current track) and playback absent', () => {
    const t = makeTrack('x')
    expect(voteStatusLabel({ track: t, currentTrack: null, playback: null })).toBe('')
  })
})
