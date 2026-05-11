/**
 * Browser playback compatibility hook.
 *
 * Returns false for the first port, hiding the lower "Create Party" button
 * area entirely. This is the safe default: an incompatible browser cannot
 * host a party anyway. Replace with real Spotify Web Playback SDK feature
 * detection (window.MediaSource + AudioContext presence check) when the
 * platform-compat task is scheduled.
 */
export function usePlaybackCompatible(): boolean {
  return false
}
