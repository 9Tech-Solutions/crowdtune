import { createFileRoute } from '@tanstack/react-router'
import { SpotifyCallbackPage } from '@/pages/spotify-callback'

export const Route = createFileRoute('/spotify/callback')({ component: SpotifyCallbackPage })
