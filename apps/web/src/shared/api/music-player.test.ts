import { beforeEach, afterEach, expect, it, vi } from 'vite-plus/test'
import { createMusicPlayer } from './music-player'

vi.mock('./music-config', () => ({ getSpotifyAccessToken: vi.fn(async () => 'test-token') }))
beforeEach(() => {
  delete window.MusicKit
  delete window.YT
  delete window.Spotify
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('destroys a YouTube player that never becomes ready', async () => {
  vi.useFakeTimers()
  const destroy = vi.fn()
  window.YT = {
    Player: class {
      loadVideoById = () => {}
      playVideo = () => {}
      pauseVideo = () => {}
      destroy = destroy
      getCurrentTime = () => 0
      getPlayerState = () => 0
    },
  }
  const container = document.createElement('div')
  const rejected = expect(
    createMusicPlayer('youtube', {
      container,
      developerToken: '',
      onEnded: vi.fn(),
      onError: vi.fn(),
    }),
  ).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(20_000)
  await rejected
  expect(destroy).toHaveBeenCalledOnce()
  expect(container.children).toHaveLength(0)
})

it('uses a visible YouTube player, reports completion, and cleans it up', async () => {
  type Options = ConstructorParameters<NonNullable<typeof window.YT>['Player']>[1]
  let options: Options | undefined
  const load = vi.fn(),
    pause = vi.fn(),
    destroy = vi.fn(),
    resume = vi.fn()
  window.YT = {
    Player: class {
      constructor(_element: HTMLElement, config: Options) {
        options = config
        queueMicrotask(config.events.onReady)
      }
      loadVideoById = load
      pauseVideo = pause
      playVideo = resume
      destroy = destroy
      getCurrentTime = () => 3
      getPlayerState = () => 1
    },
  }
  const ended = vi.fn()
  const player = await createMusicPlayer('youtube', {
    container: document.createElement('div'),
    developerToken: '',
    onEnded: ended,
    onError: vi.fn(),
  })
  expect(options?.height).toBe('240')
  expect(options?.playerVars.controls).toBe(1)
  await player.play('abcdefghijk')
  expect(load).toHaveBeenCalledWith('abcdefghijk')
  expect(await player.snapshot()).toEqual({ positionMs: 3000, playing: true })
  options?.events.onStateChange({ data: 0 })
  expect(ended).toHaveBeenCalledOnce()
  await player.pause()
  await player.resume()
  await player.dispose()
  expect(pause).toHaveBeenCalledOnce()
  expect(resume).toHaveBeenCalledOnce()
  expect(destroy).toHaveBeenCalledOnce()
})

it('authorizes Apple Music and plays a song through the MusicKit singleton', async () => {
  const ended = vi.fn(),
    authorize = vi.fn(async () => 'test-user-token')
  let changed: (() => void) | undefined
  const sdk = {
    isAuthorized: false,
    authorize,
    setQueue: vi.fn(async () => {}),
    play: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    currentPlaybackTime: 4,
    playbackState: 2,
    addEventListener: (_event: string, callback: () => void) => {
      changed = callback
    },
    removeEventListener: vi.fn(),
  }
  window.MusicKit = {
    configure: vi.fn(),
    getInstance: () => sdk,
    PlaybackStates: { playing: 2, completed: 10 },
  }
  const player = await createMusicPlayer('apple-music', {
    container: document.createElement('div'),
    developerToken: 'test-developer-token',
    onEnded: ended,
    onError: vi.fn(),
  })
  await player.play('123')
  expect(authorize).toHaveBeenCalledOnce()
  expect(sdk.setQueue).toHaveBeenCalledWith({ songs: ['123'] })
  expect(await player.snapshot()).toEqual({ positionMs: 4000, playing: true })
  sdk.playbackState = 10
  changed?.()
  expect(ended).toHaveBeenCalledOnce()
  await player.dispose()
  expect(sdk.removeEventListener).toHaveBeenCalledWith('playbackStateDidChange', changed)
  expect(sdk.stop).toHaveBeenCalledOnce()
})

it('starts Spotify playback only on the ready device and preserves pause/resume', async () => {
  const listeners = new Map<string, (data: never) => void>()
  const pause = vi.fn(async () => {}),
    resume = vi.fn(async () => {}),
    disconnect = vi.fn()
  window.Spotify = {
    Player: class {
      addListener(event: string, callback: (data: never) => void) {
        listeners.set(event, callback)
      }
      connect = async () => {
        listeners.get('ready')?.({ device_id: 'device' } as never)
        return true
      }
      disconnect = disconnect
      pause = pause
      resume = resume
      activateElement = async () => {}
      getCurrentState = async () => ({
        position: 1234,
        duration: 2000,
        paused: false,
        track_window: { current_track: { uri: 'spotify:track:song' } },
      })
    },
  }
  const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetcher)
  const player = await createMusicPlayer('spotify', {
    container: document.createElement('div'),
    developerToken: '',
    onEnded: vi.fn(),
    onError: vi.fn(),
  })
  await player.play('song')
  expect(fetcher).toHaveBeenCalledWith(
    'https://api.spotify.com/v1/me/player/play?device_id=device',
    expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ uris: ['spotify:track:song'] }),
    }),
  )
  expect(await player.snapshot()).toEqual({ positionMs: 1234, playing: true })
  await player.pause()
  await player.resume()
  await player.dispose()
  expect(pause).toHaveBeenCalledOnce()
  expect(resume).toHaveBeenCalledOnce()
  expect(disconnect).toHaveBeenCalledOnce()
})
