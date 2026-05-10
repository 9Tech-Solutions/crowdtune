import { describe, it, expect } from 'vitest'
import { fanartLoadCandidates, metadataLoadCandidates } from './load-candidates'
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

function makeMetadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    title: 'Test',
    artists: ['Artist'],
    coverImages: [],
    durationMs: 180_000,
    isPlayable: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// fanartLoadCandidates
// ---------------------------------------------------------------------------

describe('fanartLoadCandidates', () => {
  it('returns empty array when queue is empty', () => {
    expect(fanartLoadCandidates({ queue: [], metadata: {} })).toEqual([])
  })

  it('skips tracks with no metadata entry', () => {
    const t = makeTrack('a')
    const result = fanartLoadCandidates({ queue: [t], metadata: {} })
    expect(result).toEqual([])
  })

  it('skips tracks that already have backgroundImages', () => {
    const t = makeTrack('a')
    const meta = makeMetadata({ backgroundImages: ['https://img.example.com/bg.jpg'] })
    const result = fanartLoadCandidates({
      queue: [t],
      metadata: { 'spotify-a': meta },
    })
    expect(result).toEqual([])
  })

  it('includes track with metadata and no backgroundImages', () => {
    const t = makeTrack('a')
    const meta = makeMetadata()
    const result = fanartLoadCandidates({
      queue: [t],
      metadata: { 'spotify-a': meta },
    })
    expect(result).toHaveLength(1)
    expect(result[0][0]).toBe('spotify-a')
    expect(result[0][1]).toBe(meta)
  })

  it('includes track with metadata and empty backgroundImages array', () => {
    const t = makeTrack('a')
    const meta = makeMetadata({ backgroundImages: [] })
    const result = fanartLoadCandidates({
      queue: [t],
      metadata: { 'spotify-a': meta },
    })
    expect(result).toHaveLength(1)
  })

  it('returns at most 2 candidates', () => {
    const tracks = ['a', 'b', 'c'].map((id) => makeTrack(id, { order: ['a', 'b', 'c'].indexOf(id) }))
    const metadata: Record<string, Metadata> = {
      'spotify-a': makeMetadata(),
      'spotify-b': makeMetadata(),
      'spotify-c': makeMetadata(),
    }
    const result = fanartLoadCandidates({ queue: tracks, metadata })
    expect(result).toHaveLength(2)
  })

  it('only examines tracks in queue order (first two)', () => {
    const a = makeTrack('a')
    const b = makeTrack('b')
    const c = makeTrack('c')
    const metadata: Record<string, Metadata> = {
      // 'spotify-a' is missing - so a is skipped
      'spotify-b': makeMetadata(),
      'spotify-c': makeMetadata(),
    }
    const result = fanartLoadCandidates({ queue: [a, b, c], metadata })
    // a skipped (no meta), b and c are candidates - but only 2 max
    expect(result.map(([k]) => k)).toEqual(['spotify-b', 'spotify-c'])
  })

  it('returns as [identityKey, Metadata] tuples', () => {
    const t = makeTrack('xyz')
    const meta = makeMetadata()
    const result = fanartLoadCandidates({
      queue: [t],
      metadata: { 'spotify-xyz': meta },
    })
    const [key, m] = result[0]
    expect(key).toBe('spotify-xyz')
    expect(m).toBe(meta)
  })
})

// ---------------------------------------------------------------------------
// metadataLoadCandidates
// ---------------------------------------------------------------------------

describe('metadataLoadCandidates', () => {
  it('returns empty array when queue is empty', () => {
    expect(metadataLoadCandidates({ queue: [], metadata: {} })).toEqual([])
  })

  it('includes track id when no metadata entry exists', () => {
    const t = makeTrack('abc')
    const result = metadataLoadCandidates({ queue: [t], metadata: {} })
    expect(result).toEqual(['abc'])
  })

  it('includes track id when metadata exists but durationMs is missing', () => {
    const t = makeTrack('abc')
    // Cast through unknown to simulate a backend bug where durationMs is absent.
    const meta = makeMetadata({ durationMs: undefined as unknown as number })
    const result = metadataLoadCandidates({
      queue: [t],
      metadata: { 'spotify-abc': meta },
    })
    expect(result).toEqual(['abc'])
  })

  it('excludes track when metadata and durationMs are both present', () => {
    const t = makeTrack('abc')
    const meta = makeMetadata({ durationMs: 200_000 })
    const result = metadataLoadCandidates({
      queue: [t],
      metadata: { 'spotify-abc': meta },
    })
    expect(result).toEqual([])
  })

  it('returns the raw provider id (not the composite key)', () => {
    const t = makeTrack('rawId')
    const result = metadataLoadCandidates({ queue: [t], metadata: {} })
    // Should be 'rawId', NOT 'spotify-rawId'
    expect(result).toEqual(['rawId'])
    expect(result[0]).not.toContain('spotify-')
  })

  it('walks the full queue (not just the first two)', () => {
    const tracks = ['a', 'b', 'c', 'd', 'e'].map((id) => makeTrack(id))
    const result = metadataLoadCandidates({ queue: tracks, metadata: {} })
    expect(result).toHaveLength(5)
  })

  it('mixes present and absent metadata correctly', () => {
    const a = makeTrack('a')
    const b = makeTrack('b')
    const c = makeTrack('c')
    const metadata: Record<string, Metadata> = {
      'spotify-b': makeMetadata({ durationMs: 200_000 }),
    }
    const result = metadataLoadCandidates({ queue: [a, b, c], metadata })
    // a and c missing metadata; b has durationMs
    expect(result.sort()).toEqual(['a', 'c'])
  })
})
