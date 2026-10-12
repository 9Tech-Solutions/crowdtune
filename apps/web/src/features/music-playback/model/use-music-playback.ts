import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'
import { createMusicPlayer, type MusicPlayer } from '@/shared/api/music-player'
import { getMusicConfig, getSpotifyAccessToken } from '@/shared/api/music-config'
import type { Playback } from '@/entities/party'
import type { TrackReference } from '@/entities/track'

type PlaybackResponse = Playback & { reference: TrackReference | null }
type Controller = { player: MusicPlayer; reference: TrackReference }

export function useMusicPlayback(partyId: string, enabled: boolean) {
  const cache = useQueryClient()
  const container = useRef<HTMLDivElement>(null)
  const attachContainer = useCallback((node: HTMLDivElement | null) => {
    container.current = node
  }, [])
  const controller = useRef<Controller | null>(null)
  const startingReference = useRef<TrackReference | null>(null)
  const masterId = useRef(crypto.randomUUID())
  const busy = useRef(false)
  const mounted = useRef(false)
  const generation = useRef(0)
  const [isBusy, setIsBusy] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const base = `/api/parties/${encodeURIComponent(partyId)}`

  async function command(
    action: string,
    reference?: TrackReference,
    snapshot?: { positionMs: number; playing: boolean },
  ) {
    const state = await api<PlaybackResponse | null>(`${base}/playback`, {
      method: 'POST',
      body: { action, masterId: masterId.current, reference, ...snapshot },
    })
    if (mounted.current) cache.setQueryData(['playback', partyId], state)
    return state
  }

  async function stop() {
    const active = controller.current
    controller.current = null
    if (active) {
      try {
        await active.player.pause()
      } finally {
        await active.player.dispose()
      }
    }
    if (mounted.current) setIsPlaying(false)
  }

  async function play(reference: TrackReference) {
    const epoch = generation.current
    await stop()
    await command('claim', reference)
    startingReference.current = reference
    const config = await getMusicConfig()
    if (!mounted.current || generation.current !== epoch) return
    if (reference.provider === 'spotify') {
      await getSpotifyAccessToken()
    }
    if (!container.current) return
    const player = await createMusicPlayer(reference.provider, {
      container: container.current,
      developerToken: config.appleMusic.developerToken,
      onEnded: () => {
        void run(() => advance(reference, true))
      },
      onError: (message) => {
        if (mounted.current) setError(message)
      },
    })
    if (!mounted.current || generation.current !== epoch) {
      await player.dispose()
      return
    }
    controller.current = { player, reference }
    await player.play(reference.id)
    startingReference.current = null
    await command('state', reference, await player.snapshot())
    setIsPlaying((await player.snapshot()).playing)
  }

  async function advance(reference: TrackReference, continuePlaying: boolean) {
    await stop()
    const state = await command('advance', reference)
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['party-queue', partyId] }),
      cache.invalidateQueries({ queryKey: ['party-tv-queue', partyId] }),
    ])
    if (continuePlaying && state?.reference) await play(state.reference)
  }

  async function run(action: () => Promise<unknown>) {
    if (!enabled || busy.current) return
    busy.current = true
    const epoch = generation.current
    setIsBusy(true)
    setError(null)
    try {
      await action()
    } catch (reason) {
      if (generation.current !== epoch) return
      try {
        await stop()
      } catch {
        /* Player may already be disconnected. */
      }
      if (mounted.current)
        setError(reason instanceof Error ? reason.message : 'Playback failed. Try again.')
    } finally {
      if (generation.current === epoch) {
        startingReference.current = null
        busy.current = false
        if (mounted.current) setIsBusy(false)
      }
    }
  }

  useEffect(() => {
    mounted.current = true
    const id = masterId.current
    const effectEpoch = generation.current
    function pauseHiddenVideo() {
      const active = controller.current
      if (document.hidden && active?.reference.provider === 'youtube')
        void active.player.pause().catch(() => {})
    }
    document.addEventListener('visibilitychange', pauseHiddenVideo)
    if (!enabled)
      return () => {
        mounted.current = false
        generation.current = effectEpoch + 1
        document.removeEventListener('visibilitychange', pauseHiddenVideo)
      }
    let heartbeatPending = false
    const timer = setInterval(() => {
      const active = controller.current
      const reference = active?.reference ?? startingReference.current
      if (!reference || (busy.current && !startingReference.current) || heartbeatPending) return
      heartbeatPending = true
      void (active ? active.player.snapshot() : Promise.resolve({ positionMs: 0, playing: false }))
        .then(async (snapshot) => {
          if (!mounted.current || generation.current !== effectEpoch) return
          await api(`${base}/playback`, {
            method: 'POST',
            body: {
              action: 'state',
              masterId: masterId.current,
              reference,
              ...snapshot,
            },
          })
          if (mounted.current) setIsPlaying(snapshot.playing)
        })
        .catch(async (reason) => {
          if (!mounted.current || generation.current !== effectEpoch) return
          controller.current = null
          if (active) {
            await active.player.pause().catch(() => {})
            await Promise.resolve(active.player.dispose()).catch(() => {})
          }
          if (mounted.current) {
            setIsPlaying(false)
            setError(reason instanceof Error ? reason.message : 'Playback connection lost.')
          }
        })
        .finally(() => {
          heartbeatPending = false
        })
    }, 5000)
    return () => {
      mounted.current = false
      generation.current = effectEpoch + 1
      busy.current = false
      const hadControl = controller.current !== null || startingReference.current !== null
      startingReference.current = null
      document.removeEventListener('visibilitychange', pauseHiddenVideo)
      clearInterval(timer)
      const active = controller.current
      controller.current = null
      if (active) {
        void active.player
          .pause()
          .finally(() => active.player.dispose())
          .catch(() => {})
      }
      if (hadControl) {
        void api(`${base}/playback`, {
          method: 'POST',
          body: { action: 'release', masterId: id },
        }).catch(() => {})
      }
    }
  }, [base, enabled])

  function toggle(reference: TrackReference) {
    return run(async () => {
      const active = controller.current
      if (active && isPlaying) {
        await active.player.pause()
        await command('state', active.reference, await active.player.snapshot())
        setIsPlaying(false)
      } else if (
        active?.reference.provider === reference.provider &&
        active.reference.id === reference.id
      ) {
        await command('claim', reference, await active.player.snapshot())
        await active.player.resume()
        await command('state', reference, await active.player.snapshot())
        setIsPlaying((await active.player.snapshot()).playing)
      } else await play(reference)
    })
  }
  function remove(reference: TrackReference) {
    return run(async () => {
      const active = controller.current
      if (active?.reference.provider === reference.provider && active.reference.id === reference.id)
        await advance(reference, isPlaying)
      else {
        await command('remove', reference)
        await cache.invalidateQueries({ queryKey: ['party-queue', partyId] })
      }
    })
  }
  return {
    attachContainer,
    toggle,
    remove,
    skip: (reference: TrackReference) => run(() => advance(reference, isPlaying)),
    disconnect: () =>
      run(async () => {
        await stop()
        await command('release')
      }),
    isPlaying,
    isBusy,
    error,
  }
}
