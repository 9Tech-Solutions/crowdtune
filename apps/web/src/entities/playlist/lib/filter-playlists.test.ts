import { describe, expect, it } from 'vitest'
import type { Playlist } from '../model/types'
import { filterPlaylists } from './filter-playlists'

function makePlaylist(name: string, trackCount = 10): Playlist {
  return {
    name,
    ref: {
      id: 'p_' + name.toLowerCase().replace(/\s+/g, '_'),
      provider: 'spotify',
      spotifyUserId: 'host123',
    },
    trackCount,
  }
}

describe('filterPlaylists', () => {
  describe('empty inputs', () => {
    it('returns empty array when input is empty and query is empty', () => {
      expect(filterPlaylists([], '')).toEqual([])
    })

    it('returns empty array when input is empty and query is non-empty', () => {
      expect(filterPlaylists([], 'rock')).toEqual([])
    })
  })

  describe('empty query short-circuit', () => {
    it('returns the full list when query is empty string', () => {
      const list = [makePlaylist('A'), makePlaylist('B'), makePlaylist('C')]
      expect(filterPlaylists(list, '')).toEqual(list)
    })

    it('returns the SAME array reference when query is empty (no allocation)', () => {
      const list = [makePlaylist('A'), makePlaylist('B')]
      expect(filterPlaylists(list, '')).toBe(list)
    })
  })

  describe('case-insensitive substring match', () => {
    it('matches when needle is fully lowercase and name is mixed case', () => {
      const list = [makePlaylist('My Chill Vibes'), makePlaylist('Workout')]
      expect(filterPlaylists(list, 'chill')).toEqual([list[0]])
    })

    it('matches when needle is fully uppercase and name is mixed case', () => {
      const list = [makePlaylist('My Chill Vibes'), makePlaylist('Workout')]
      expect(filterPlaylists(list, 'CHILL')).toEqual([list[0]])
    })

    it('matches when needle is mixed case', () => {
      const list = [makePlaylist('My Chill Vibes')]
      expect(filterPlaylists(list, 'ChIlL')).toEqual(list)
    })

    it('matches at the start of the name', () => {
      const list = [makePlaylist('My Chill Vibes')]
      expect(filterPlaylists(list, 'my')).toEqual(list)
    })

    it('matches at the end of the name', () => {
      const list = [makePlaylist('My Chill Vibes')]
      expect(filterPlaylists(list, 'vibes')).toEqual(list)
    })

    it('matches a substring inside the name', () => {
      const list = [makePlaylist('My Chill Vibes')]
      expect(filterPlaylists(list, 'ill v')).toEqual(list)
    })
  })

  describe('no match cases', () => {
    it('returns empty when no playlist matches', () => {
      const list = [makePlaylist('My Chill Vibes'), makePlaylist('Workout')]
      expect(filterPlaylists(list, 'jazz')).toEqual([])
    })

    it('does NOT match a non-contiguous "fuzzy" subsequence', () => {
      // "myc" is not a substring of "my chill vibes" (space breaks it)
      const list = [makePlaylist('My Chill Vibes')]
      expect(filterPlaylists(list, 'myc')).toEqual([])
    })
  })

  describe('multiple matches preserve input order', () => {
    it('keeps the original order in the output', () => {
      const list = [
        makePlaylist('Chill A'),
        makePlaylist('Workout'),
        makePlaylist('Chill B'),
        makePlaylist('Coding'),
        makePlaylist('Chill C'),
      ]
      const result = filterPlaylists(list, 'chill')
      expect(result.map((p) => p.name)).toEqual(['Chill A', 'Chill B', 'Chill C'])
    })
  })

  describe('literal characters (no regex)', () => {
    it('treats regex metacharacters as literal', () => {
      const list = [makePlaylist('Movie (2024)'), makePlaylist('Other')]
      expect(filterPlaylists(list, '(2024)')).toEqual([list[0]])
    })

    it('treats period as literal, not "any character"', () => {
      const list = [makePlaylist('Hits 2024'), makePlaylist('Hits.2024')]
      expect(filterPlaylists(list, 'hits.')).toEqual([list[1]])
    })
  })

  describe('whitespace handling (parity with reference)', () => {
    it('does NOT trim whitespace from query', () => {
      const list = [makePlaylist('My Chill Vibes')]
      // " chill" (leading space) matches because the name has spaces inside.
      expect(filterPlaylists(list, ' chill')).toEqual(list)
    })

    it('single-space query matches playlists with spaces in name', () => {
      const list = [makePlaylist('My Chill Vibes'), makePlaylist('Coding')]
      expect(filterPlaylists(list, ' ')).toEqual([list[0]])
    })

    it('trailing-space query that does not appear in name does not match', () => {
      const list = [makePlaylist('Workout')]
      expect(filterPlaylists(list, 'workout ')).toEqual([])
    })
  })

  describe('empty playlist name', () => {
    it('empty-name playlist does not match a non-empty query', () => {
      const list = [makePlaylist(''), makePlaylist('Workout')]
      expect(filterPlaylists(list, 'work')).toEqual([list[1]])
    })

    it('empty-name playlist appears in the output when query is empty (short-circuit)', () => {
      const list = [makePlaylist(''), makePlaylist('Workout')]
      expect(filterPlaylists(list, '')).toEqual(list)
    })
  })
})
