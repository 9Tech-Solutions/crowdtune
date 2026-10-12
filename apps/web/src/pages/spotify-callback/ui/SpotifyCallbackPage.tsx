import { useEffect, useState } from 'react'
import { finishSpotifyConnection } from '@/features/connect-music'

// Cache the one-use code exchange across StrictMode's effect replay.
let connection: { search: string; result: Promise<string> } | undefined
export function SpotifyCallbackPage() {
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const search = window.location.search
    if (!connection || connection.search !== search)
      connection = { search, result: finishSpotifyConnection(search) }
    void connection.result
      .then((path) => {
        if (active) window.location.replace(path)
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Spotify connection failed.')
      })
    return () => {
      active = false
    }
  }, [])
  return (
    <main className="max-w-md mx-auto p-8">
      <h1 className="text-2xl font-bold">Connect Spotify</h1>
      {error ? (
        <p role="alert">
          {error} <a href="/">Return home</a>
        </p>
      ) : (
        <p role="status">Completing Spotify authorization…</p>
      )}
    </main>
  )
}
