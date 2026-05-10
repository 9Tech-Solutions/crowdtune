import type { Playlist } from '../model/types'

/**
 * Returns the subset of playlists whose `name` contains the query as a
 * case-insensitive substring. When the query is an empty string, returns
 * the full input list unchanged (short-circuit, no allocation).
 *
 * Does NOT trim whitespace from the query - callers that want trim
 * semantics must trim before calling. This preserves parity with the
 * Festify-equivalent behavior the spec mandates.
 *
 * The match is a simple substring check (no regex, no fuzzy ranking).
 * Order of the output matches the order of the input.
 */
export function filterPlaylists(playlists: Playlist[], query: string): Playlist[] {
  if (!query) {
    return playlists
  }
  const needle = query.toLowerCase()
  return playlists.filter((p) => p.name.toLowerCase().includes(needle))
}
