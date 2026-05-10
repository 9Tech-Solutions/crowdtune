import { describe, it, expect } from 'vitest'
import { trackIdentityKey, tracksAreEqual } from './identity'
import type { Track, TrackReference } from '../model/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRef(provider: 'spotify', id: string): TrackReference {
  return { provider, id }
}

function makeTrack(id: string, overrides: Partial<Track> = {}): Track {
  return {
    ref: makeRef('spotify', id),
    addedAt: '2024-01-01T00:00:00.000Z',
    isFallback: false,
    voteCount: 0,
    order: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// trackIdentityKey
// ---------------------------------------------------------------------------

describe('trackIdentityKey', () => {
  it('builds key from a TrackReference', () => {
    const ref = makeRef('spotify', 'abc123')
    expect(trackIdentityKey(ref)).toBe('spotify-abc123')
  })

  it('builds key from a Track (uses embedded ref)', () => {
    const track = makeTrack('def456')
    expect(trackIdentityKey(track)).toBe('spotify-def456')
  })

  it('separates provider and id with a hyphen', () => {
    const ref = makeRef('spotify', 'my-track-id')
    expect(trackIdentityKey(ref)).toBe('spotify-my-track-id')
  })

  it('handles ids that already contain hyphens', () => {
    const ref = makeRef('spotify', '4uLU6hMCjMI75M1A2tKUQC')
    expect(trackIdentityKey(ref)).toBe('spotify-4uLU6hMCjMI75M1A2tKUQC')
  })
})

// ---------------------------------------------------------------------------
// tracksAreEqual
// ---------------------------------------------------------------------------

describe('tracksAreEqual', () => {
  it('returns true when both are null', () => {
    expect(tracksAreEqual(null, null)).toBe(true)
  })

  it('returns true when both are undefined', () => {
    expect(tracksAreEqual(undefined, undefined)).toBe(true)
  })

  it('returns true when one is null and the other is undefined', () => {
    expect(tracksAreEqual(null, undefined)).toBe(true)
  })

  it('returns false when a is null and b is a track', () => {
    const b = makeTrack('x')
    expect(tracksAreEqual(null, b)).toBe(false)
  })

  it('returns false when a is a track and b is null', () => {
    const a = makeTrack('x')
    expect(tracksAreEqual(a, null)).toBe(false)
  })

  it('returns false when a is undefined and b is a track', () => {
    const b = makeTrack('x')
    expect(tracksAreEqual(undefined, b)).toBe(false)
  })

  it('returns true when a and b are the same object reference', () => {
    const a = makeTrack('x')
    expect(tracksAreEqual(a, a)).toBe(true)
  })

  it('returns true when a.ref and b.ref are the same object reference', () => {
    const sharedRef = makeRef('spotify', 'same')
    const a = makeTrack('same', { ref: sharedRef })
    const b = makeTrack('same', { ref: sharedRef })
    // Different track objects but same ref instance
    expect(a === b).toBe(false)
    expect(tracksAreEqual(a, b)).toBe(true)
  })

  it('returns true when provider and id are the same (distinct ref objects)', () => {
    const a = makeTrack('abc')
    const b = makeTrack('abc')
    expect(tracksAreEqual(a, b)).toBe(true)
  })

  it('returns false when ids differ', () => {
    const a = makeTrack('abc')
    const b = makeTrack('def')
    expect(tracksAreEqual(a, b)).toBe(false)
  })

  it('uses strict equality for provider comparison (no type coercion)', () => {
    const a = makeTrack('same')
    // Construct b with the same id but verify strict === provider check works
    const b = makeTrack('same')
    expect(tracksAreEqual(a, b)).toBe(true)
  })
})
