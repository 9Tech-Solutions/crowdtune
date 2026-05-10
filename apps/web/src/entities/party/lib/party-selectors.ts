import type { Party, Playback } from '../model/types'

/**
 * Returns true iff the authenticated user is the host (creator) of the party.
 * Uses strict equality against the JWT sub claim stored in party.createdBy.
 * Returns false for any null/undefined input - no tri-state, no loading variant.
 */
export function isHost(
  party: Party | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  if (!party || !currentUserId) return false
  return currentUserId === party.createdBy
}

/**
 * Returns the masterId from the party's embedded playback sub-object,
 * or null when no party is present or no master is designated.
 */
export function playbackMasterId(
  party: Party | null | undefined,
): string | null {
  return party?.playback?.masterId ?? null
}

/**
 * Returns true iff the local device/tab is the designated playback master.
 * Both identifiers must be non-null, non-empty, and strictly equal.
 * Treats empty string as equivalent to null (no master / not yet set).
 */
export function isPlaybackMaster(
  party: Party | null | undefined,
  localInstanceId: string | null | undefined,
): boolean {
  const masterId = playbackMasterId(party)
  if (!masterId || !localInstanceId) return false
  return masterId === localInstanceId
}

/**
 * Returns true iff the party has an active playback master AND it is a
 * different device than the current one. The "other" qualifier is significant:
 * a device that IS the master must return false here.
 * Empty-string masterId is treated as "no master" (same as null).
 */
export function hasOtherPlaybackMaster(
  party: Party | null | undefined,
  localInstanceId: string | null | undefined,
): boolean {
  const masterId = playbackMasterId(party)
  if (!masterId) return false
  return !isPlaybackMaster(party, localInstanceId)
}

/**
 * Returns the full embedded Playback sub-object from the party record,
 * or null when no party is present. No transformation applied.
 */
export function playbackState(
  party: Party | null | undefined,
): Playback | null {
  return party?.playback ?? null
}
