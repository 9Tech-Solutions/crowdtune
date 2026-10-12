export type MusicProvider = 'spotify' | 'youtube' | 'apple-music'

export const MUSIC_PROVIDER_LABELS: Record<MusicProvider, string> = {
  spotify: 'Spotify',
  youtube: 'YouTube / YouTube Music',
  'apple-music': 'Apple Music',
}

export function isMusicProvider(value: unknown): value is MusicProvider {
  return value === 'spotify' || value === 'youtube' || value === 'apple-music'
}
