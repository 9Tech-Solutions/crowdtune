import { beforeEach, expect, it, vi } from 'vite-plus/test'
import { finishSpotifyConnection } from './spotify'
import { api } from '@/shared/api'

vi.mock('@/shared/api', () => ({ api: vi.fn(() => Promise.resolve({})) }))
beforeEach(() => {
  sessionStorage.clear()
  vi.mocked(api).mockClear()
})

it('rejects a forged OAuth state before exchanging a code', async () => {
  sessionStorage.setItem(
    'crowdtune.spotify.authorization',
    JSON.stringify({
      state: 'expected',
      redirectUri: 'https://example.test/spotify/callback',
      returnTo: '/party/ABC123',
    }),
  )
  await expect(finishSpotifyConnection('?state=forged&code=code')).rejects.toThrow('verified')
  expect(api).not.toHaveBeenCalled()
})

it('exchanges a valid code once and returns the local party path', async () => {
  sessionStorage.setItem(
    'crowdtune.spotify.authorization',
    JSON.stringify({
      state: 'expected',
      redirectUri: 'https://example.test/spotify/callback',
      returnTo: '/party/ABC123',
    }),
  )
  await expect(finishSpotifyConnection('?state=expected&code=code')).resolves.toBe('/party/ABC123')
  expect(api).toHaveBeenCalledWith('/api/spotify/token', {
    method: 'POST',
    body: { code: 'code', redirectUri: 'https://example.test/spotify/callback' },
  })
  await expect(finishSpotifyConnection('?state=expected&code=code')).rejects.toThrow()
})

it('rejects an external return destination', async () => {
  sessionStorage.setItem(
    'crowdtune.spotify.authorization',
    JSON.stringify({
      state: 'expected',
      redirectUri: 'https://example.test/spotify/callback',
      returnTo: '//evil.test',
    }),
  )
  await expect(finishSpotifyConnection('?state=expected&code=code')).rejects.toThrow('destination')
  expect(api).not.toHaveBeenCalled()
})
