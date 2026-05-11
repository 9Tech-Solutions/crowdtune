/**
 * PartyTrackSearch widget.
 *
 * Mounts at /party/$partyId/search as a child of the party page shell.
 * Reads partyId from TanStack Router's useParams - no props accepted from
 * the route file.
 *
 * Auth gate note: for the first port the add button is enabled regardless of
 * auth state. The underlying useAddTrack mutation is a no-op placeholder.
 * When the real backend lands and the sign-in gate logic is confirmed, the
 * gate moves into the useAddTrack hook or a wrapper around it. The row
 * component does not check auth directly.
 *
 * Deferred concerns recorded in docs/translation-progress.md:
 * - useSearchTracks backend implementation
 * - useAddTrack backend implementation
 * - Pagination of search results (capped at 20 for first port)
 */
import { useRef, useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearch } from '@tanstack/react-router'
import { Input, Spinner } from '@heroui/react'

import type { TrackReference } from '@/entities/track'
import { trackIdentityKey } from '@/entities/track'

import type { SearchResult } from '../api/useSearchTracks'
import { useSearchTracks } from '../api/useSearchTracks'
import { useAddTrack } from '../api/useAddTrack'
import { SearchResultRow } from './SearchResultRow'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300

// ---------------------------------------------------------------------------
// Queue snapshot type
// ---------------------------------------------------------------------------

type QueueSnapshot = Record<string, { voteCount: number }>

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PartyTrackSearch() {
  const { partyId } = useParams({ from: '/party/$partyId/search' })
  const navigate = useNavigate()

  // Read the committed query from the URL (drives data fetching).
  const search = useSearch({ from: '/party/$partyId/search' })
  const committedQuery: string = (search as Record<string, unknown>).q as string ?? ''

  // Local input state: updates on every keystroke.
  const [localQuery, setLocalQuery] = useState<string>(committedQuery)

  // Debounce timer ref.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Input element ref for focus management.
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Live region ref for accessibility announcements.
  const liveRef = useRef<HTMLDivElement | null>(null)

  // Per-track pending state: track identity key -> boolean.
  const [pendingTracks, setPendingTracks] = useState<Record<string, boolean>>({})

  // Already-added tracks: track identity key -> true. Stays visible with
  // "already queued" indicator per the lock-now decision (row persists).
  const [addedTracks, setAddedTracks] = useState<Record<string, boolean>>({})

  // Placeholder queue snapshot (real data arrives from party shell's cache
  // when the backend queue query is wired up).
  const queueSnapshot: QueueSnapshot = {}

  // Data hooks.
  const { data: results = [], isLoading, isError } = useSearchTracks(partyId, committedQuery)
  const { mutate: addTrack } = useAddTrack(partyId)

  // ---------------------------------------------------------------------------
  // Commit query to URL
  // ---------------------------------------------------------------------------

  const commitQuery = useCallback(
    (q: string) => {
      const trimmed = q.trim()
      void navigate({
        to: '/party/$partyId/search',
        params: { partyId },
        search: { q: trimmed || undefined },
        replace: true,
      })
    },
    [navigate, partyId],
  )

  // ---------------------------------------------------------------------------
  // Auto-focus on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ---------------------------------------------------------------------------
  // Pre-populate input when URL has a query on mount (back-nav restore).
  // On mount: if committedQuery is set, the input is already synced via
  // useState initial value, and the query fires immediately via useSearchTracks.
  // No extra work needed here - the enabled flag inside useSearchTracks handles
  // this transparently.
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Debounce: write URL param 300ms after last keystroke.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      commitQuery(localQuery)
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [localQuery, commitQuery])

  // ---------------------------------------------------------------------------
  // Keyboard handlers
  // ---------------------------------------------------------------------------

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      commitQuery(localQuery)
      inputRef.current?.focus()
    } else if (e.key === 'Escape') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      setLocalQuery('')
      void navigate({
        to: '/party/$partyId/search',
        params: { partyId },
        search: { q: undefined },
        replace: true,
      })
      inputRef.current?.focus()
    }
  }

  // ---------------------------------------------------------------------------
  // Add-to-queue handler
  // ---------------------------------------------------------------------------

  function handleAdd(ref: TrackReference) {
    const key = trackIdentityKey(ref)
    setPendingTracks((prev) => ({ ...prev, [key]: true }))

    addTrack(ref, {
      onSuccess: () => {
        setPendingTracks((prev) => ({ ...prev, [key]: false }))
        setAddedTracks((prev) => ({ ...prev, [key]: true }))
        if (liveRef.current) {
          const title = results.find(
            (r) => trackIdentityKey(r.trackRef) === key,
          )?.metadata?.title ?? ref.id
          liveRef.current.textContent = `${title} added to queue.`
        }
      },
      onError: () => {
        setPendingTracks((prev) => ({ ...prev, [key]: false }))
        console.warn('[PartyTrackSearch] Failed to add track. Retry or show toast when toast API is wired.')
      },
    })
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const isIdle = committedQuery.trim().length === 0

  function renderContent() {
    if (isIdle) {
      return (
        <p className="text-center text-sm text-default-500 px-4 py-8">
          Search for songs to add to the queue.
        </p>
      )
    }

    if (isLoading) {
      return (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      )
    }

    if (isError) {
      return (
        <p className="text-center text-sm text-danger px-4 py-8">
          Search is unavailable right now. Please try again.
        </p>
      )
    }

    // No-results state. The populated-results case is rendered by the call
    // site (see hasResults branch in the JSX below); this function is only
    // invoked when hasResults is false, so reaching here means results.length
    // is zero and not idle/loading/error.
    return (
      <p className="text-center text-sm text-default-500 px-4 py-8">
        No tracks found. Try a different search term.
      </p>
    )
  }

  function renderRow(result: SearchResult) {
    const key = trackIdentityKey(result.trackRef)
    const queueEntry = queueSnapshot[key]
    const isAlreadyQueued = key in addedTracks || queueEntry != null
    const voteCount = queueEntry?.voteCount ?? 0
    const isAddPending = pendingTracks[key] ?? false

    return (
      <li key={key}>
        <SearchResultRow
          metadata={result.metadata}
          trackRef={result.trackRef}
          voteCount={voteCount}
          isAlreadyQueued={isAlreadyQueued}
          isAddPending={isAddPending}
          onAdd={handleAdd}
        />
      </li>
    )
  }

  const hasResults = !isIdle && !isLoading && !isError && results.length > 0

  return (
    <div className="flex flex-col gap-4 pt-4">
      {/* Hidden live region for screen reader announcements */}
      <div
        ref={liveRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* Search input */}
      <div className="px-4">
        <Input
          ref={inputRef}
          aria-label="Search for tracks"
          placeholder="Search for a song, artist, or album..."
          value={localQuery}
          fullWidth
          autoComplete="off"
          onChange={(e) => setLocalQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Results region */}
      <div
        role="region"
        aria-label="Search results"
        aria-busy={isLoading}
      >
        {hasResults ? (
          <ul className="list-none m-0 p-0">
            {results.map((result) => renderRow(result))}
          </ul>
        ) : (
          renderContent()
        )}
      </div>
    </div>
  )
}
