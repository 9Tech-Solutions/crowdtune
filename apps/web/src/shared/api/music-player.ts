import type { MusicProvider } from '@/shared/model'
import { getSpotifyAccessToken } from './music-config'

export type PlayerReference = { provider: MusicProvider; id: string }
export type MusicPlayer = {
  play: (id: string) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  snapshot: () => Promise<{ positionMs: number; playing: boolean }>
  dispose: () => void | Promise<void>
}
type PlayerOptions = {
  container: HTMLElement
  developerToken: string
  onEnded: () => void
  onError: (message: string) => void
}
type SpotifyState = {
  position: number
  duration: number
  paused: boolean
  track_window: { current_track: { uri: string } }
}
type SpotifySDKPlayer = {
  addListener: (event: string, callback: (data: never) => void) => void
  connect: () => Promise<boolean>
  disconnect: () => void
  pause: () => Promise<void>
  resume: () => Promise<void>
  activateElement: () => Promise<void>
  getCurrentState: () => Promise<SpotifyState | null>
}
type YouTubeSDKPlayer = {
  loadVideoById: (id: string) => void
  playVideo: () => void
  pauseVideo: () => void
  destroy: () => void
  getCurrentTime: () => number
  getPlayerState: () => number
}
type AppleSDKPlayer = {
  isAuthorized: boolean
  authorize: () => Promise<string>
  setQueue: (queue: { songs: string[] }) => Promise<unknown>
  play: () => Promise<void>
  pause: () => Promise<void>
  stop: () => Promise<void>
  currentPlaybackTime: number
  playbackState: number
  addEventListener: (event: string, callback: () => void) => void
  removeEventListener: (event: string, callback: () => void) => void
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void
    onYouTubeIframeAPIReady?: () => void
    Spotify?: {
      Player: new (config: {
        name: string
        getOAuthToken: (callback: (token: string) => void) => void
      }) => SpotifySDKPlayer
    }
    YT?: {
      Player: new (
        element: HTMLElement,
        options: {
          width: string
          height: string
          playerVars: Record<string, string | number>
          events: {
            onReady: () => void
            onStateChange: (event: { data: number }) => void
            onError: () => void
            onAutoplayBlocked: () => void
          }
        },
      ) => YouTubeSDKPlayer
    }
    MusicKit?: {
      configure: (config: { developerToken: string; app: { name: string; build: string } }) => void
      getInstance: () => AppleSDKPlayer
      PlaybackStates: { playing: number; completed: number }
    }
  }
}

const scripts = new Map<string, Promise<void>>()
function loadSDK(src: string, ready: 'spotify' | 'youtube' | 'apple-music'): Promise<void> {
  const present = () =>
    ready === 'spotify'
      ? !!window.Spotify
      : ready === 'youtube'
        ? !!window.YT?.Player
        : !!window.MusicKit
  if (present()) return Promise.resolve()
  const existing = scripts.get(src)
  if (existing) return existing
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    const timer = setTimeout(() => fail(), 20_000)
    const finish = () => {
      clearTimeout(timer)
      document.removeEventListener('musickitloaded', finish)
      resolve()
    }
    const fail = () => {
      clearTimeout(timer)
      document.removeEventListener('musickitloaded', finish)
      script.remove()
      scripts.delete(src)
      reject(new Error('The music player could not load. Check your connection and try again.'))
    }
    if (ready === 'spotify') window.onSpotifyWebPlaybackSDKReady = finish
    if (ready === 'youtube') window.onYouTubeIframeAPIReady = finish
    if (ready === 'apple-music') document.addEventListener('musickitloaded', finish, { once: true })
    script.async = true
    script.src = src
    script.onerror = fail
    script.onload = () => {
      if (present()) finish()
    }
    document.head.append(script)
  })
  scripts.set(src, promise)
  return promise
}

export async function createMusicPlayer(
  provider: MusicProvider,
  options: PlayerOptions,
): Promise<MusicPlayer> {
  if (provider === 'youtube') {
    await loadSDK('https://www.youtube.com/iframe_api', provider)
    const mount = document.createElement('div')
    options.container.append(mount)
    let active = false
    let player: YouTubeSDKPlayer | undefined
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('YouTube player timed out.')), 20_000)
      player = new window.YT!.Player(mount, {
        width: '100%',
        height: '240',
        playerVars: { origin: window.location.origin, playsinline: 1, controls: 1 },
        events: {
          onReady: () => {
            clearTimeout(timer)
            resolve()
          },
          onStateChange: (event) => {
            if (active && event.data === 0) {
              active = false
              options.onEnded()
            }
          },
          onError: () =>
            options.onError(
              'YouTube could not play this video. It may be unavailable or cannot be embedded.',
            ),
          onAutoplayBlocked: () =>
            options.onError('Press Play in the YouTube player to allow playback.'),
        },
      })
    }).catch((error) => {
      try {
        player?.destroy()
      } finally {
        mount.remove()
      }
      throw error
    })
    const readyPlayer = player!
    return {
      play: async (id) => {
        active = true
        readyPlayer.loadVideoById(id)
      },
      pause: async () => {
        readyPlayer.pauseVideo()
      },
      resume: async () => {
        readyPlayer.playVideo()
      },
      snapshot: async () => ({
        positionMs: Math.round(readyPlayer.getCurrentTime() * 1000),
        playing: readyPlayer.getPlayerState() === 1,
      }),
      dispose: () => {
        active = false
        readyPlayer.destroy()
        mount.remove()
      },
    }
  }
  if (provider === 'apple-music') {
    if (!options.developerToken)
      throw new Error('Apple Music has not been configured by the server administrator.')
    await loadSDK('https://js-cdn.music.apple.com/musickit/v3/musickit.js', provider)
    window.MusicKit!.configure({
      developerToken: options.developerToken,
      app: { name: 'CrowdTune', build: '1' },
    })
    const player = window.MusicKit!.getInstance()
    if (!player.isAuthorized) await player.authorize()
    let active = false
    const changed = () => {
      if (active && player.playbackState === window.MusicKit!.PlaybackStates.completed) {
        active = false
        options.onEnded()
      }
    }
    player.addEventListener('playbackStateDidChange', changed)
    return {
      play: async (id) => {
        active = false
        await player.setQueue({ songs: [id] })
        active = true
        await player.play()
      },
      pause: async () => {
        await player.pause()
      },
      resume: () => player.play(),
      snapshot: async () => ({
        positionMs: Math.round(player.currentPlaybackTime * 1000),
        playing: player.playbackState === window.MusicKit!.PlaybackStates.playing,
      }),
      dispose: async () => {
        active = false
        player.removeEventListener('playbackStateDidChange', changed)
        await player.stop()
      },
    }
  }
  await loadSDK('https://sdk.scdn.co/spotify-player.js', provider)
  const player = new window.Spotify!.Player({
    name: 'CrowdTune',
    getOAuthToken: (callback) => {
      void getSpotifyAccessToken()
        .then(callback)
        .catch(() => options.onError('Reconnect Spotify to continue playback.'))
    },
  })
  let currentUri = ''
  let previous: SpotifyState | null = null
  player.addListener('player_state_changed', (state: SpotifyState | null) => {
    if (
      state?.track_window.current_track.uri === currentUri &&
      state.paused &&
      state.position === 0 &&
      previous &&
      previous.track_window.current_track.uri === currentUri &&
      previous.position >= previous.duration - 5000 &&
      previous.position > 0
    ) {
      currentUri = ''
      options.onEnded()
    }
    previous = state
  })
  for (const event of [
    'initialization_error',
    'authentication_error',
    'account_error',
    'playback_error',
  ]) {
    player.addListener(event, () =>
      options.onError(
        event === 'account_error'
          ? 'Spotify Premium is required for playback.'
          : 'Spotify playback failed. Reconnect your account and try again.',
      ),
    )
  }
  let deviceId: string
  try {
    deviceId = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Spotify player timed out.')), 20_000)
      player.addListener('ready', (event: { device_id: string }) => {
        clearTimeout(timer)
        resolve(event.device_id)
      })
      void player
        .connect()
        .then((connected) => {
          if (!connected) {
            clearTimeout(timer)
            reject(new Error('Spotify could not connect.'))
          }
        })
        .catch((error) => {
          clearTimeout(timer)
          reject(error)
        })
    })
  } catch (error) {
    player.disconnect()
    throw error
  }
  return {
    play: async (id) => {
      await player.activateElement()
      const token = await getSpotifyAccessToken()
      currentUri = `spotify:track:${id}`
      previous = null
      const response = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ uris: [currentUri] }),
        },
      )
      if (!response.ok)
        throw new Error(
          'Spotify could not start this track. Check your subscription, permissions, and availability.',
        )
    },
    pause: () => player.pause(),
    resume: () => player.resume(),
    snapshot: async () => {
      const state = await player.getCurrentState()
      previous = state
      return {
        positionMs: state?.position ?? 0,
        playing: !!state && !state.paused && state.track_window.current_track.uri === currentUri,
      }
    },
    dispose: () => {
      currentUri = ''
      previous = null
      player.disconnect()
    },
  }
}
