import { useMutation } from '@tanstack/react-query'
import type { PlaylistReference } from '@/entities/playlist'

type InsertPlaylistArgs = {
  playlistRef: PlaylistReference
  shuffle: boolean
}

/**
 * Placeholder mutation: POST playlist tracks into the party queue.
 *
 * The mutationFn resolves immediately (no-op) until the backend endpoint
 * for inserting a playlist is implemented. When the real endpoint lands,
 * replace the mutationFn body with a call to api() from @/shared/api,
 * passing playlistRef and shuffle flag, and add cache invalidation for the
 * queue query key.
 *
 * Deferred concern recorded in docs/translation-progress.md under the
 * party-settings section. Spotify token re-auth on 401 is the caller's
 * responsibility (see open question 7 in the spec).
 *
 * @param partyId - The current party's identifier. Used in the mutationKey
 *   so distinct parties don't share mutation state.
 */
export function useInsertPlaylist(partyId: string) {
  return useMutation<void, Error, InsertPlaylistArgs>({
    mutationKey: ['insert-playlist', partyId],
    mutationFn: () => Promise.resolve(),
  })
}
