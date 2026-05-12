/**
 * PlaylistPanel: right-side panel of PartySettings.
 *
 * Shows a Spotify sign-in prompt when the host has not connected Spotify,
 * or a filterable playlist picker when they have.
 *
 * Filter is client-side, case-insensitive substring match against
 * playlist.name. No debounce (list is typically small, per spec section 4).
 */
import { Button, Input, Label, Spinner } from '@heroui/react'

import type { Playlist, PlaylistReference } from '@/entities/playlist'
import { filterPlaylists } from '@/entities/playlist'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  isSpotifyConnected: boolean
  isSpotifyAuthInProgress: boolean
  playlists: Playlist[]
  isPlaylistsLoading: boolean
  isInsertPending: boolean
  playlistFilter: string
  onFilterChange: (value: string) => void
  onConnectSpotify: () => void
  onInsertPlaylist: (ref: PlaylistReference, shuffle: boolean) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlaylistPanel({
  isSpotifyConnected,
  isSpotifyAuthInProgress,
  playlists,
  isPlaylistsLoading,
  isInsertPending,
  playlistFilter,
  onFilterChange,
  onConnectSpotify,
  onInsertPlaylist,
}: Props) {
  return (
    <section aria-label="Fallback Playlist">
      <h2 className="text-lg font-semibold mb-4">Fallback Playlist</h2>

      {!isSpotifyConnected ? (
        renderConnectPrompt(isSpotifyAuthInProgress, onConnectSpotify)
      ) : (
        renderPicker(
          playlists,
          isPlaylistsLoading,
          isInsertPending,
          playlistFilter,
          onFilterChange,
          onInsertPlaylist,
        )
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Spotify not-connected prompt
// ---------------------------------------------------------------------------

function renderConnectPrompt(
  isAuthInProgress: boolean,
  onConnect: () => void,
): React.ReactNode {
  return (
    <div className="flex flex-col gap-3">
      {isAuthInProgress ? (
        <>
          <Spinner size="md" aria-label="Connecting to Spotify..." />
          <p className="sr-only" aria-live="polite">
            Connecting to Spotify...
          </p>
        </>
      ) : (
        <Button
          variant="secondary"
          aria-label="Connect with Spotify"
          onPress={onConnect}
        >
          Connect with Spotify
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Playlist picker (Spotify connected)
// ---------------------------------------------------------------------------

function renderPicker(
  playlists: Playlist[],
  isLoading: boolean,
  isInsertPending: boolean,
  filter: string,
  onFilterChange: (v: string) => void,
  onInsert: (ref: PlaylistReference, shuffle: boolean) => void,
): React.ReactNode {
  const filtered = filterPlaylists(playlists, filter)

  return (
    <div className="flex flex-col gap-3">
      {/* Filter input */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="playlist-filter-input">Search your playlists</Label>
        <Input
          id="playlist-filter-input"
          aria-label="Filter playlists"
          placeholder="Search your playlists"
          value={filter}
          fullWidth
          onChange={(e) => onFilterChange(e.target.value)}
        />
      </div>

      {/* Playlist list region */}
      <div
        role="region"
        aria-label="Spotify playlists"
        aria-busy={isLoading ? 'true' : 'false'}
        className="flex flex-col gap-2 max-h-96 overflow-y-auto"
      >
        {isLoading ? (
          <>
            <div className="flex justify-center py-6">
              <Spinner size="md" />
            </div>
            <p className="sr-only" aria-live="polite">
              Loading playlists...
            </p>
          </>
        ) : playlists.length === 0 ? (
          <p className="text-sm text-muted py-4">
            No playlists found in your Spotify account.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted py-4">No playlists match your search.</p>
        ) : (
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {filtered.map((playlist) => (
              <PlaylistRow
                key={playlist.ref.id}
                playlist={playlist}
                isInsertPending={isInsertPending}
                onInsert={onInsert}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PlaylistRow
// ---------------------------------------------------------------------------

type RowProps = {
  playlist: Playlist
  isInsertPending: boolean
  onInsert: (ref: PlaylistReference, shuffle: boolean) => void
}

function PlaylistRow({ playlist, isInsertPending, onInsert }: RowProps) {
  return (
    <li className="flex items-center justify-between gap-2">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate">{playlist.name}</span>
        <span className="text-xs text-muted">{playlist.trackCount} tracks</span>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button
          size="sm"
          variant="secondary"
          isDisabled={isInsertPending}
          aria-label={`Add ${playlist.name} in order`}
          onPress={() => onInsert(playlist.ref, false)}
        >
          Insert in order
        </Button>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={isInsertPending}
          aria-label={`Shuffle and add ${playlist.name}`}
          onPress={() => onInsert(playlist.ref, true)}
        >
          Insert shuffled
        </Button>
      </div>
    </li>
  )
}
