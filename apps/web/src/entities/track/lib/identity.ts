import type { Track, TrackReference } from '../model/types'

/**
 * Returns the canonical cross-provider identity key for a track or reference.
 * Format: "<provider>-<id>", e.g. "spotify-4uLU6hMCjMI75M1A2tKUQC".
 */
export function trackIdentityKey(input: Track | TrackReference): string {
  const ref = 'ref' in input ? input.ref : input
  return `${ref.provider}-${ref.id}`
}

/**
 * Checks whether two track values refer to the same underlying song.
 * Uses strict equality throughout except for the idiomatic `== null` guard
 * that collapses null and undefined into a single falsy check.
 *
 * Evaluation order (per spec lock-now decision 4):
 *  1. Both null/undefined → equal.
 *  2. One null/undefined, other not → not equal.
 *  3. Same object reference → equal.
 *  4. Same ref object reference → equal.
 *  5. Either missing ref → not equal.
 *  6. Same provider AND same id (strict) → equal.
 *  7. Else → not equal.
 */
export function tracksAreEqual(
  a: Track | null | undefined,
  b: Track | null | undefined,
): boolean {
  // Rule 1: both absent
  if (a == null && b == null) return true
  // Rule 2: one absent
  if (a == null || b == null) return false
  // Rule 3: same object reference
  if (a === b) return true
  // Rule 4: same ref object reference
  if (a.ref === b.ref) return true
  // Rule 5: either missing ref (defensive – our types require it, but guard anyway)
  if (!a.ref || !b.ref) return false
  // Rule 6: provider + id match (strict)
  return a.ref.provider === b.ref.provider && a.ref.id === b.ref.id
}
