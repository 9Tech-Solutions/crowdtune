import { api } from './client'

export type MusicConfig = {
  spotify: { configured: boolean; clientId: string; redirectUri: string }
  appleMusic: { configured: boolean; developerToken: string }
  youtube: { configured: boolean; searchConfigured: boolean }
}

export function getMusicConfig() {
  return api<MusicConfig>('/api/music/config')
}
export async function getSpotifyAccessToken() {
  const result = await api<{ accessToken: string }>('/api/music/spotify/access-token')
  return result.accessToken
}
