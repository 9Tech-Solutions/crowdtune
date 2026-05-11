/**
 * Placeholder Spotify status hook for the first port.
 *
 * Always returns `{ isConnected: false, isPremium: false }` because
 * GET /api/spotify/token (Phase 9b.2) is not yet built and the Premium
 * tier field has not been mapped to our stack. The deferred concern is
 * recorded in docs/translation-progress.md. When useSpotifyStatus lands
 * in entities/spotify, replace this import at the HomePage call site.
 */
export function useSpotifyStatusPlaceholder(): {
  isConnected: boolean
  isPremium: boolean
} {
  return { isConnected: false, isPremium: false }
}
