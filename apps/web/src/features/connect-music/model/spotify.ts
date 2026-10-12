import { api } from '@/shared/api'
import { getMusicConfig } from '@/shared/api/music-config'

const STORAGE_KEY = 'crowdtune.spotify.authorization'

export async function connectSpotify(partyId: string) {
  const config = await getMusicConfig()
  if (!config.spotify.configured)
    throw new Error('Spotify has not been configured by the server administrator.')
  const redirect = new URL(config.spotify.redirectUri)
  if (
    redirect.protocol !== 'https:' &&
    !(redirect.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(redirect.hostname))
  )
    throw new Error('Spotify requires an HTTPS or loopback IP redirect URI.')
  if (redirect.origin !== window.location.origin || redirect.pathname !== '/spotify/callback')
    throw new Error(
      `Open CrowdTune at ${redirect.origin} and configure its /spotify/callback redirect before connecting Spotify.`,
    )
  const state = crypto.randomUUID()
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      state,
      redirectUri: config.spotify.redirectUri,
      returnTo: `/party/${encodeURIComponent(partyId)}`,
    }),
  )
  const url = new URL('https://accounts.spotify.com/authorize')
  url.search = new URLSearchParams({
    client_id: config.spotify.clientId,
    response_type: 'code',
    redirect_uri: config.spotify.redirectUri,
    scope:
      'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state',
    state,
  }).toString()
  window.location.assign(url)
}

export async function finishSpotifyConnection(search: string): Promise<string> {
  const stored = sessionStorage.getItem(STORAGE_KEY)
  sessionStorage.removeItem(STORAGE_KEY)
  const params = new URLSearchParams(search)
  const authorization = stored
    ? (JSON.parse(stored) as { state: string; redirectUri: string; returnTo: string })
    : null
  if (
    !authorization ||
    params.get('state') !== authorization.state ||
    params.get('error') ||
    !params.get('code')
  )
    throw new Error('Spotify authorization could not be verified. Start the connection again.')
  if (!/^\/party\/[A-Za-z0-9]+$/.test(authorization.returnTo))
    throw new Error('Invalid return destination.')
  await api('/api/spotify/token', {
    method: 'POST',
    body: { code: params.get('code'), redirectUri: authorization.redirectUri },
  })
  return authorization.returnTo
}
