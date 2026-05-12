import type { Image } from '@/shared/model'

/**
 * Picks the best cover image URL for a given rendered pixel size.
 *
 * Provider image lists are ordered largest first. The heuristic scans the list
 * smallest-to-largest and returns the first image whose width is at or above
 * `targetPx`. When no image qualifies (the target is larger than every
 * available image), the smallest image is returned as a fallback.
 *
 * Returns `undefined` only when the input list is empty.
 *
 * @param images Provider-ordered list of available images (largest first).
 * @param targetPx Rendered width in CSS pixels the caller will display at.
 */
export function pickCoverUrl(images: Image[], targetPx: number): string | undefined {
  if (images.length === 0) return undefined
  const best = [...images].reverse().find((img) => img.width >= targetPx)
  return (best ?? images[images.length - 1]).url
}
