import { describe, it, expect } from 'vitest'
import { sortedQueue, currentTrack, currentTrackKey } from './queue'
import type { Track, Metadata } from '../model/types'

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

function makeMetadata(durationMs: number, overrides: Partial<Metadata> = {}): Metadata {
  return {
    title: 'Test Track',
    artists: ['Artist'],
    coverImages: [],
    durationMs,
    isPlayable: true,
    ...overrides,
  }
}

function tracksRecord(tracks: Track[]): Record<string, Track> {
  return Object.fromEntries(tracks.map((t) => [`spotify-${t.ref.id}`, t]))
}

function metadataRecord(entries: Array<[string, Metadata]>): Record<string, Metadata> {
  return Object.fromEntries(entries)
}

// ---------------------------------------------------------------------------
// sortedQueue
// ---------------------------------------------------------------------------

describe('sortedQueue', () => {
  it('returns empty array when tracks record is empty', () => {
    const result = sortedQueue({ tracks: {}, metadata: {}, maxTrackLengthMinutes: null })
    expect(result).toEqual([])
  })

  it('sorts tracks by order ascending', () => {
    const a = makeTrack('a', { order: 3 })
    const b = makeTrack('b', { order: 1 })
    const c = makeTrack('c', { order: 2 })
    const result = sortedQueue({
      tracks: tracksRecord([a, b, c]),
      metadata: {},
      maxTrackLengthMinutes: null,
    })
    expect(result.map((t) => t.ref.id)).toEqual(['b', 'c', 'a'])
  })

  it('places NaN order values at the end', () => {
    const good = makeTrack('good', { order: 1 })
    const nan = makeTrack('nan', { order: NaN })
    const result = sortedQueue({
      tracks: tracksRecord([nan, good]),
      metadata: {},
      maxTrackLengthMinutes: null,
    })
    expect(result[0].ref.id).toBe('good')
    expect(result[1].ref.id).toBe('nan')
  })

  it('tie-breaks equal order values by addedAt ascending', () => {
    const earlier = makeTrack('earlier', { order: 1, addedAt: '2024-01-01T00:00:00.000Z' })
    const later = makeTrack('later', { order: 1, addedAt: '2024-01-02T00:00:00.000Z' })
    const result = sortedQueue({
      tracks: tracksRecord([later, earlier]),
      metadata: {},
      maxTrackLengthMinutes: null,
    })
    expect(result.map((t) => t.ref.id)).toEqual(['earlier', 'later'])
  })

  it('excludes tracks with no ref provider', () => {
    const bad = { ...makeTrack('bad'), ref: { provider: '' as 'spotify', id: 'bad' } }
    const good = makeTrack('good', { order: 1 })
    const result = sortedQueue({
      tracks: tracksRecord([bad, good]),
      metadata: {},
      maxTrackLengthMinutes: null,
    })
    expect(result.map((t) => t.ref.id)).toEqual(['good'])
  })

  it('excludes tracks with no ref id', () => {
    const bad = { ...makeTrack('bad'), ref: { provider: 'spotify' as const, id: '' } }
    const good = makeTrack('good', { order: 1 })
    const result = sortedQueue({
      tracks: tracksRecord([bad, good]),
      metadata: {},
      maxTrackLengthMinutes: null,
    })
    expect(result.map((t) => t.ref.id)).toEqual(['good'])
  })

  it('includes track when metadata is missing (unknown duration)', () => {
    const track = makeTrack('mystery', { order: 0 })
    const result = sortedQueue({
      tracks: tracksRecord([track]),
      metadata: {},
      maxTrackLengthMinutes: 3,
    })
    expect(result).toHaveLength(1)
  })

  it('excludes track when durationMs exceeds limit', () => {
    const long = makeTrack('long', { order: 0 })
    const meta = makeMetadata(10 * 60_000 + 1) // 10 min 1 ms
    const result = sortedQueue({
      tracks: tracksRecord([long]),
      metadata: metadataRecord([['spotify-long', meta]]),
      maxTrackLengthMinutes: 10,
    })
    expect(result).toHaveLength(0)
  })

  it('includes track exactly at the duration limit', () => {
    const exact = makeTrack('exact', { order: 0 })
    const meta = makeMetadata(3 * 60_000) // exactly 3 minutes
    const result = sortedQueue({
      tracks: tracksRecord([exact]),
      metadata: metadataRecord([['spotify-exact', meta]]),
      maxTrackLengthMinutes: 3,
    })
    expect(result).toHaveLength(1)
  })

  it('applies no duration limit when maxTrackLengthMinutes is null', () => {
    const long = makeTrack('long', { order: 0 })
    const meta = makeMetadata(60 * 60_000) // 1 hour
    const result = sortedQueue({
      tracks: tracksRecord([long]),
      metadata: metadataRecord([['spotify-long', meta]]),
      maxTrackLengthMinutes: null,
    })
    expect(result).toHaveLength(1)
  })

  it('applies no duration limit when maxTrackLengthMinutes is 0', () => {
    const long = makeTrack('long', { order: 0 })
    const meta = makeMetadata(60 * 60_000)
    const result = sortedQueue({
      tracks: tracksRecord([long]),
      metadata: metadataRecord([['spotify-long', meta]]),
      maxTrackLengthMinutes: 0,
    })
    expect(result).toHaveLength(1)
  })

  it('does not mutate the original tracks record', () => {
    const a = makeTrack('a', { order: 2 })
    const b = makeTrack('b', { order: 1 })
    const rec = tracksRecord([a, b])
    const keys = Object.keys(rec)
    sortedQueue({ tracks: rec, metadata: {}, maxTrackLengthMinutes: null })
    expect(Object.keys(rec)).toEqual(keys)
  })
})

// ---------------------------------------------------------------------------
// currentTrack
// ---------------------------------------------------------------------------

describe('currentTrack', () => {
  it('returns null when queue is empty', () => {
    expect(currentTrack([])).toBeNull()
  })

  it('returns the first element when queue has one track', () => {
    const t = makeTrack('only')
    expect(currentTrack([t])).toBe(t)
  })

  it('returns the first element when queue has multiple tracks', () => {
    const first = makeTrack('first')
    const second = makeTrack('second')
    expect(currentTrack([first, second])).toBe(first)
  })
})

// ---------------------------------------------------------------------------
// currentTrackKey
// ---------------------------------------------------------------------------

describe('currentTrackKey', () => {
  it('returns null when queue is empty', () => {
    expect(currentTrackKey([])).toBeNull()
  })

  it('returns the identity key of the first track', () => {
    const t = makeTrack('abc123')
    expect(currentTrackKey([t])).toBe('spotify-abc123')
  })
})
