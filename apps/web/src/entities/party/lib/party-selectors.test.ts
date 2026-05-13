import { describe, expect, it } from 'vitest'
import type { Party, Playback } from '../model/types'
import {
  hasOtherPlaybackMaster,
  isHost,
  isPlaybackMaster,
  playbackMasterId,
  playbackState,
} from './party-selectors'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_PLAYBACK: Playback = {
  lastChange: '2024-01-01T00:00:00Z',
  lastPositionMs: 0,
  masterId: null,
  playing: false,
  targetPlaying: null,
}

function makeParty(overrides: Partial<Party> = {}): Party {
  return {
    id: 'ABC123',
    shortId: 'ABC123',
    name: 'Test Party',
    countryCode: 'US',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    hostUserId: 'user-host-id',
    isActive: true,
    playback: { ...BASE_PLAYBACK },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// isHost
// ---------------------------------------------------------------------------

describe('isHost', () => {
  it('returns false when party is null', () => {
    expect(isHost(null, 'user-host-id')).toBe(false)
  })

  it('returns false when party is undefined', () => {
    expect(isHost(undefined, 'user-host-id')).toBe(false)
  })

  it('returns false when currentUserId is null', () => {
    expect(isHost(makeParty(), null)).toBe(false)
  })

  it('returns false when currentUserId is undefined', () => {
    expect(isHost(makeParty(), undefined)).toBe(false)
  })

  it('returns false when both party and currentUserId are null', () => {
    expect(isHost(null, null)).toBe(false)
  })

  it('returns true when currentUserId matches party.createdBy', () => {
    expect(isHost(makeParty(), 'user-host-id')).toBe(true)
  })

  it('returns false when currentUserId does not match party.createdBy', () => {
    expect(isHost(makeParty(), 'different-user-id')).toBe(false)
  })

  it('uses strict equality - does not coerce types', () => {
    // Empty string never equals a real user id
    expect(isHost(makeParty(), '')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// playbackMasterId
// ---------------------------------------------------------------------------

describe('playbackMasterId', () => {
  it('returns null when party is null', () => {
    expect(playbackMasterId(null)).toBeNull()
  })

  it('returns null when party is undefined', () => {
    expect(playbackMasterId(undefined)).toBeNull()
  })

  it('returns null when no master is designated (masterId is null)', () => {
    expect(playbackMasterId(makeParty({ playback: { ...BASE_PLAYBACK, masterId: null } }))).toBeNull()
  })

  it('returns the masterId string when a master is designated', () => {
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: 'instance-abc' } })
    expect(playbackMasterId(party)).toBe('instance-abc')
  })

  it('returns empty string as-is when masterId is empty (callers guard against this)', () => {
    // playbackMasterId itself does not treat '' as null; that is isPlaybackMaster's job
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: '' } })
    expect(playbackMasterId(party)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// isPlaybackMaster
// ---------------------------------------------------------------------------

describe('isPlaybackMaster', () => {
  it('returns false when party is null', () => {
    expect(isPlaybackMaster(null, 'instance-abc')).toBe(false)
  })

  it('returns false when localInstanceId is null', () => {
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: 'instance-abc' } })
    expect(isPlaybackMaster(party, null)).toBe(false)
  })

  it('returns false when localInstanceId is undefined', () => {
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: 'instance-abc' } })
    expect(isPlaybackMaster(party, undefined)).toBe(false)
  })

  it('returns false when localInstanceId is empty string (treated as null)', () => {
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: 'instance-abc' } })
    expect(isPlaybackMaster(party, '')).toBe(false)
  })

  it('returns false when masterId is null (no master designated)', () => {
    expect(isPlaybackMaster(makeParty(), 'instance-abc')).toBe(false)
  })

  it('returns false when masterId is empty string (treated as no master)', () => {
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: '' } })
    expect(isPlaybackMaster(party, 'instance-abc')).toBe(false)
  })

  it('returns false when master exists but local instance not yet set (page-load transient)', () => {
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: 'instance-abc' } })
    expect(isPlaybackMaster(party, null)).toBe(false)
  })

  it('returns true when current device is the master', () => {
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: 'instance-abc' } })
    expect(isPlaybackMaster(party, 'instance-abc')).toBe(true)
  })

  it('returns false when identifiers differ', () => {
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: 'instance-abc' } })
    expect(isPlaybackMaster(party, 'instance-xyz')).toBe(false)
  })

  it('handles the theoretical two-devices-same-instanceId case: returns true without throwing', () => {
    // Two devices with the same UUID would both return true simultaneously.
    // This is a logical impossibility with UUID-level entropy but must not throw.
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: 'shared-id' } })
    expect(() => isPlaybackMaster(party, 'shared-id')).not.toThrow()
    expect(isPlaybackMaster(party, 'shared-id')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// hasOtherPlaybackMaster
// ---------------------------------------------------------------------------

describe('hasOtherPlaybackMaster', () => {
  it('returns false when party is null', () => {
    expect(hasOtherPlaybackMaster(null, 'instance-abc')).toBe(false)
  })

  it('returns false when party is undefined', () => {
    expect(hasOtherPlaybackMaster(undefined, 'instance-abc')).toBe(false)
  })

  it('returns false when no master is designated (masterId is null)', () => {
    expect(hasOtherPlaybackMaster(makeParty(), 'instance-abc')).toBe(false)
  })

  it('returns false when masterId is empty string (treated as no master)', () => {
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: '' } })
    expect(hasOtherPlaybackMaster(party, 'instance-abc')).toBe(false)
  })

  it('returns false when current device IS the master', () => {
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: 'instance-abc' } })
    expect(hasOtherPlaybackMaster(party, 'instance-abc')).toBe(false)
  })

  it('returns true when a foreign master exists and local instance is unset (null)', () => {
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: 'foreign-instance' } })
    expect(hasOtherPlaybackMaster(party, null)).toBe(true)
  })

  it('returns true when a foreign master exists and local instance differs', () => {
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: 'foreign-instance' } })
    expect(hasOtherPlaybackMaster(party, 'my-instance')).toBe(true)
  })

  it('returns true when master exists but local instance is empty string', () => {
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: 'foreign-instance' } })
    expect(hasOtherPlaybackMaster(party, '')).toBe(true)
  })

  it('returns false when both party and localInstanceId are null', () => {
    expect(hasOtherPlaybackMaster(null, null)).toBe(false)
  })

  it('theoretical two-devices-same-id: hasOtherPlaybackMaster is false, isPlaybackMaster is true', () => {
    // Documents the invariant: if you ARE the master, there is no "other" master.
    const party = makeParty({ playback: { ...BASE_PLAYBACK, masterId: 'shared-id' } })
    expect(hasOtherPlaybackMaster(party, 'shared-id')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// playbackState
// ---------------------------------------------------------------------------

describe('playbackState', () => {
  it('returns null when party is null', () => {
    expect(playbackState(null)).toBeNull()
  })

  it('returns null when party is undefined', () => {
    expect(playbackState(undefined)).toBeNull()
  })

  it('returns the embedded Playback object when party is present', () => {
    const playback: Playback = { ...BASE_PLAYBACK, playing: true, lastPositionMs: 42000 }
    const party = makeParty({ playback })
    expect(playbackState(party)).toBe(playback)
  })

  it('returns the full Playback object without transformation', () => {
    const party = makeParty()
    const result = playbackState(party)
    expect(result).toEqual(BASE_PLAYBACK)
  })
})
