import type { TrackReference } from '../model/types'

/** Accept only track/video links on the providers' exact public hosts. */
export function parseTrackLink(input: string): TrackReference | null {
  const spotify = /^spotify:track:([A-Za-z0-9]{22})$/.exec(input)
  if (spotify) return { provider: 'spotify', id: spotify[1]! }
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const path = url.pathname.split('/').filter(Boolean)
  if (url.hostname === 'open.spotify.com') {
    const trackIndex = path[0]?.startsWith('intl-') ? 1 : 0
    const id = path[trackIndex + 1]
    return path[trackIndex] === 'track' && id && /^[A-Za-z0-9]{22}$/.test(id)
      ? { provider: 'spotify', id }
      : null
  }
  if (['youtube.com', 'www.youtube.com', 'music.youtube.com', 'youtu.be'].includes(url.hostname)) {
    const id =
      url.hostname === 'youtu.be'
        ? path[0]
        : path[0] === 'watch'
          ? url.searchParams.get('v')
          : ['shorts', 'embed'].includes(path[0] ?? '')
            ? path[1]
            : null
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider: 'youtube', id } : null
  }
  if (url.hostname === 'music.apple.com') {
    const id = url.searchParams.get('i') ?? (path[1] === 'song' ? path.at(-1) : null)
    return id && /^\d+$/.test(id) ? { provider: 'apple-music', id } : null
  }
  return null
}
