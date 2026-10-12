import { useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api'

export type SpotifyStatus = { isConnected: boolean; isPremium: boolean }

export type UseSpotifyStatusResult = {
  data: SpotifyStatus | null
  isLoading: boolean
  error: Error | null
}

/**
 * Fetches the Spotify connection status for the authenticated user via
 * GET /api/spotify/status. Cache key is user-scoped — ['spotifyStatus', userId]
 * — because there is no queryClient.clear() on sign-out in this codebase, so
 * an unscoped key would serve User A's status to User B within the staleTime
 * window.
 *
 * Enabled only once a userId is known; keeps the query idle while the session
 * is still loading. staleTime of 30 s balances freshness against network cost
 * during an open party session.
 */
export function useSpotifyStatus(userId: string | undefined): UseSpotifyStatusResult {
  const {
    data = null,
    isLoading,
    error,
  } = useQuery<SpotifyStatus, Error>({
    queryKey: ['spotifyStatus', userId],
    queryFn: () => api<SpotifyStatus>('/api/spotify/status'),
    enabled: !!userId,
    staleTime: 30_000,
  })

  return { data, isLoading, error }
}
