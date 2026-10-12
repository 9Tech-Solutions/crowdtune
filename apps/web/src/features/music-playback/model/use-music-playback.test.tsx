import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vite-plus/test'
import { TestQueryProvider } from '@/shared/test/test-providers'
import { api } from '@/shared/api'
import { createMusicPlayer, type MusicPlayer } from '@/shared/api/music-player'
import { useMusicPlayback } from './use-music-playback'

vi.mock('@/shared/api', () => ({ api: vi.fn(), ApiError: class extends Error {} }))
vi.mock('@/shared/api/music-config', () => ({
  getMusicConfig: vi.fn(async () => ({ appleMusic: { developerToken: 'test-token' } })),
  getSpotifyAccessToken: vi.fn(async () => 'test-token'),
}))
vi.mock('@/shared/api/music-player', () => ({ createMusicPlayer: vi.fn() }))

const events: string[] = []
let ended: (() => void) | undefined
beforeEach(() => {
  events.length = 0
  ended = undefined
  vi.mocked(api).mockImplementation(async (_path, init) => {
    const body = init?.body as { action: string }
    if (body.action === 'advance') return { reference: { provider: 'apple-music', id: '123' } }
    return null
  })
  vi.mocked(createMusicPlayer).mockImplementation(async (provider, options) => {
    events.push(`create:${provider}`)
    ended = options.onEnded
    const player: MusicPlayer = {
      play: async () => {
        events.push(`play:${provider}`)
      },
      pause: async () => {
        events.push(`pause:${provider}`)
      },
      resume: async () => {
        events.push(`resume:${provider}`)
      },
      dispose: async () => {
        await Promise.resolve()
        events.push(`dispose:${provider}`)
      },
      snapshot: async () => ({ positionMs: 100, playing: true }),
    }
    return player
  })
})

it('stops the previous service before automatically playing the next mixed-queue track', async () => {
  const { result } = renderHook(() => useMusicPlayback('ABC123', true), {
    wrapper: TestQueryProvider,
  })
  act(() => result.current.attachContainer(document.createElement('div')))
  await act(() => result.current.toggle({ provider: 'youtube', id: 'abcdefghijk' }))
  act(() => ended?.())
  await waitFor(() => expect(events).toContain('play:apple-music'))
  expect(events.indexOf('pause:youtube')).toBeLessThan(events.indexOf('create:apple-music'))
  expect(events.indexOf('dispose:youtube')).toBeLessThan(events.indexOf('play:apple-music'))
})

it('never initializes a player when the server rejects the playback lease', async () => {
  vi.mocked(api).mockRejectedValue(new Error('Playback is controlled by another host tab.'))
  const { result } = renderHook(() => useMusicPlayback('ABC123', true), {
    wrapper: TestQueryProvider,
  })
  act(() => result.current.attachContainer(document.createElement('div')))
  await act(() => result.current.toggle({ provider: 'youtube', id: 'abcdefghijk' }))
  expect(events).toEqual([])
  expect(result.current.error).toContain('another host tab')
})

it('does not issue playback commands for guests', async () => {
  vi.mocked(api).mockClear()
  const { result } = renderHook(() => useMusicPlayback('ABC123', false), {
    wrapper: TestQueryProvider,
  })
  await act(() => result.current.toggle({ provider: 'youtube', id: 'abcdefghijk' }))
  expect(api).not.toHaveBeenCalled()
  expect(events).toEqual([])
})
