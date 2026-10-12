import { expect, it } from 'vite-plus/test'
import { adaptQueue } from './queue'

it('preserves identities and metadata in a mixed queue and excludes unknown providers', () => {
  const metadata = {
    title: 'Song',
    artists: ['Artist'],
    coverImages: [],
    durationMs: 1000,
    isPlayable: true,
  }
  const rows = ['spotify', 'youtube', 'apple-music', 'unknown'].map((provider) => ({
    reference: { provider, id: 'same-id' },
    voteCount: 2,
    orderIdx: 1,
    isFallback: false,
    addedAt: '2026-10-13T00:00:00Z',
    metadata,
  }))
  const result = adaptQueue(rows)
  expect(result.tracks.map((t) => t.ref.provider)).toEqual(['spotify', 'youtube', 'apple-music'])
  expect(Object.keys(result.metadataByKey)).toEqual([
    'spotify-same-id',
    'youtube-same-id',
    'apple-music-same-id',
  ])
  expect(result.metadataByKey['apple-music-same-id']).toEqual(metadata)
  expect(result.tracks[0]).toMatchObject({ order: 1, voteCount: 2, addedAt: rows[0]!.addedAt })
})
