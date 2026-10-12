import { useState } from 'react'
import { Button } from '@heroui/react'
import { connectSpotify } from '@/features/connect-music'
import type { useMusicPlayback } from '@/features/music-playback'
import type { TrackReference } from '@/entities/track'
import { MUSIC_PROVIDER_LABELS } from '@/shared/model'

type Props = ReturnType<typeof useMusicPlayback> & {
  partyId: string
  trackReference: TrackReference | null
}
export function MusicPlayer({
  partyId,
  trackReference,
  isBusy,
  isPlaying,
  error,
  attachContainer,
  toggle,
  skip,
  disconnect,
}: Props) {
  const [connectionError, setConnectionError] = useState<string | null>(null)
  return (
    <section
      aria-label="Host music player"
      className="p-4 border-b border-default flex flex-col gap-3"
    >
      <h2 className="text-lg font-semibold">Host music player</h2>
      <p className="text-sm text-muted">
        {trackReference
          ? MUSIC_PROVIDER_LABELS[trackReference.provider]
          : 'Add a song to start the mixed queue.'}
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button
          isDisabled={!trackReference || isBusy}
          onPress={() => {
            if (trackReference) void toggle(trackReference)
          }}
        >
          {isBusy ? 'Connecting…' : isPlaying ? 'Pause' : 'Play'}
        </Button>
        <Button
          variant="secondary"
          isDisabled={!trackReference || isBusy}
          onPress={() => {
            if (trackReference) void skip(trackReference)
          }}
        >
          Skip track
        </Button>
        <Button
          variant="outline"
          isDisabled={isBusy}
          onPress={() => {
            setConnectionError(null)
            void connectSpotify(partyId).catch((reason) =>
              setConnectionError(
                reason instanceof Error ? reason.message : 'Spotify connection failed.',
              ),
            )
          }}
        >
          Connect Spotify
        </Button>
      </div>
      <Button
        variant="ghost"
        isDisabled={isBusy}
        onPress={() => {
          void disconnect()
        }}
      >
        Stop on this device
      </Button>
      {(error || connectionError) && (
        <p role="alert" className="text-danger">
          {connectionError ?? error}
        </p>
      )}
      <div ref={attachContainer} className="w-full max-w-xl" />
      <p className="text-xs text-muted">
        Spotify requires Premium. Apple Music requires a subscription. YouTube Music links play as
        visible YouTube videos.
      </p>
      <p className="text-xs text-muted">
        YouTube playback is subject to{' '}
        <a
          className="underline"
          href="https://www.youtube.com/t/terms"
          target="_blank"
          rel="noreferrer"
        >
          YouTube’s terms
        </a>{' '}
        and{' '}
        <a
          className="underline"
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noreferrer"
        >
          Google’s privacy policy
        </a>
        .
      </p>
    </section>
  )
}
