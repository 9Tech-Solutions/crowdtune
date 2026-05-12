import { useQuery } from '@tanstack/react-query'
import type { Playlist } from '@/entities/playlist'

/**
 * Placeholder query: fetch the host's Spotify playlists from the backend.
 *
 * Returns idle (enabled: false) when isSpotifyConnected is false, which
 * surfaces TanStack Query's 'pending' status with data: undefined rather
 * than triggering a network request. When the host has connected Spotify,
 * the query would call the backend playlists endpoint (not yet built) and
 * return Playlist[].
 *
 * For the first port both paths return empty data:
 * - Not connected: query disabled, data remains undefined.
 * - Connected: query enabled but queryFn returns [] (no backend yet).
 *
 * When the real backend lands:
 * 1. Remove the enabled guard or make it driven by isSpotifyConnected.
 * 2. Replace the queryFn body with a call to api() from @/shared/api.
 * 3. Handle Spotify 401 by attempting a silent token refresh first; fall
 *    back to the full OAuth flow only if the refresh fails (see spec
 *    section 4, open question 7).
 *
 * Deferred concern recorded in docs/translation-progress.md under the
 * party-settings section.
 */
export function useHostPlaylists(partyId: string, isSpotifyConnected: boolean) {
  return useQuery<Playlist[]>({
    queryKey: ['host-playlists', partyId],
    enabled: isSpotifyConnected,
    queryFn: async (): Promise<Playlist[]> => {
      return []
    },
  })
}
