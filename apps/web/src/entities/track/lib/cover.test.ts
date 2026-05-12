import { describe, expect, it } from 'vitest'

import type { Image } from '@/shared/model'

import { pickCoverUrl } from './cover'

const img = (width: number, url: string): Image => ({ url, width, height: width })

describe('pickCoverUrl', () => {
  it('returns undefined when the image list is empty', () => {
    expect(pickCoverUrl([], 54)).toBeUndefined()
    expect(pickCoverUrl([], 200)).toBeUndefined()
  })

  it('returns the smallest image at or above the target size', () => {
    const images = [img(640, 'large.jpg'), img(300, 'medium.jpg'), img(64, 'small.jpg')]
    expect(pickCoverUrl(images, 54)).toBe('small.jpg')
    expect(pickCoverUrl(images, 200)).toBe('medium.jpg')
    expect(pickCoverUrl(images, 400)).toBe('large.jpg')
  })

  it('returns the exact match when an image equals the target size', () => {
    const images = [img(640, 'large.jpg'), img(300, 'medium.jpg'), img(64, 'small.jpg')]
    expect(pickCoverUrl(images, 64)).toBe('small.jpg')
    expect(pickCoverUrl(images, 300)).toBe('medium.jpg')
    expect(pickCoverUrl(images, 640)).toBe('large.jpg')
  })

  it('falls back to the smallest image when the target exceeds every image', () => {
    const images = [img(640, 'large.jpg'), img(300, 'medium.jpg'), img(64, 'small.jpg')]
    expect(pickCoverUrl(images, 1000)).toBe('small.jpg')
  })

  it('handles a single-image list', () => {
    const images = [img(300, 'only.jpg')]
    expect(pickCoverUrl(images, 54)).toBe('only.jpg')
    expect(pickCoverUrl(images, 300)).toBe('only.jpg')
    expect(pickCoverUrl(images, 1000)).toBe('only.jpg')
  })

  it('does not mutate the input array', () => {
    const images = [img(640, 'large.jpg'), img(300, 'medium.jpg'), img(64, 'small.jpg')]
    const snapshot = images.map((i) => i.url)
    pickCoverUrl(images, 200)
    expect(images.map((i) => i.url)).toEqual(snapshot)
  })
})
