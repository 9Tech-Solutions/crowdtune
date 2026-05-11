import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Card, Input, Button, Text, Spinner } from '@heroui/react'
import { getSession } from '@/shared/auth'
import { useJoinParty } from '../model/use-join-party'
import { useCreateParty } from '../model/use-create-party'
import { useSpotifyStatusPlaceholder } from '../model/use-spotify-status-placeholder'
import { usePlaybackCompatible } from '@/shared/lib/use-playback-compatible'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JoinError = 'not-found' | 'expired' | 'at-capacity' | 'network'

type LowerButtonState =
  | 'creating'
  | 'create'
  | 'checking'
  | 'sign-in'
  | 'connect-spotify'

// ---------------------------------------------------------------------------
// Error messages (CrowdTune-original copy)
// ---------------------------------------------------------------------------

const JOIN_ERROR_MESSAGES: Record<JoinError, string> = {
  'not-found': 'Party not found. Check the code and try again.',
  expired: 'This party has ended. Ask the host to start a new one.',
  'at-capacity': 'This party is full. Try again later.',
  network: 'Connection failed. Check your internet and try again.',
}

function toJoinError(err: unknown): JoinError {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('not found') || msg.includes('404')) return 'not-found'
    if (msg.includes('expired') || msg.includes('ended')) return 'expired'
    if (msg.includes('capacity') || msg.includes('full')) return 'at-capacity'
  }
  return 'network'
}

// ---------------------------------------------------------------------------
// Lower button: derives the current state from auth + spotify + create flags
// ---------------------------------------------------------------------------

type LowerButtonProps = {
  state: LowerButtonState
  onSignIn: () => void
  onConnectSpotify: () => void
  onCreateParty: () => void
}

function LowerButton({
  state,
  onSignIn,
  onConnectSpotify,
  onCreateParty,
}: LowerButtonProps) {
  if (state === 'creating') {
    return (
      <Button variant="primary" size="lg" isDisabled className="w-full">
        <Spinner size="sm" />
        Creating...
      </Button>
    )
  }

  if (state === 'create') {
    return (
      <Button
        variant="primary"
        size="lg"
        onPress={onCreateParty}
        className="w-full"
      >
        Create Party
      </Button>
    )
  }

  if (state === 'checking') {
    return (
      <Button variant="secondary" size="lg" isDisabled className="w-full">
        Checking...
      </Button>
    )
  }

  if (state === 'connect-spotify') {
    return (
      <Button
        variant="secondary"
        size="lg"
        onPress={onConnectSpotify}
        className="w-full"
      >
        Connect Spotify to create Party
      </Button>
    )
  }

  // state === 'sign-in'
  return (
    <Button
      variant="secondary"
      size="lg"
      onPress={onSignIn}
      className="w-full"
    >
      Sign in to create Party
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Derived lower-button state (priority order per spec section 3)
// ---------------------------------------------------------------------------

type AuthState = 'unknown' | 'authenticated' | 'unauthenticated'

function deriveLowerButtonState(
  authState: AuthState,
  isPremium: boolean,
  isCreating: boolean,
): LowerButtonState {
  if (isCreating) return 'creating'
  if (authState === 'authenticated' && isPremium) return 'create'
  if (authState === 'unknown') return 'checking'
  return authState === 'authenticated' ? 'connect-spotify' : 'sign-in'
}

// ---------------------------------------------------------------------------
// HomePage
// ---------------------------------------------------------------------------

export function HomePage() {
  const navigate = useNavigate()
  const [partyCode, setPartyCode] = useState('')
  const [joinError, setJoinError] = useState<JoinError | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const isPlaybackCompatible = usePlaybackCompatible()
  const { isPremium } = useSpotifyStatusPlaceholder()

  const joinMutation = useJoinParty()
  const createMutation = useCreateParty()

  const isCodeValid = partyCode.trim().length > 0

  function handleJoin() {
    // Spec invariant: only one of join / create can be in flight at a time.
    if (!isCodeValid || joinMutation.isPending || createMutation.isPending) return
    setJoinError(null)
    joinMutation.mutate(
      { partyCode: partyCode.trim() },
      {
        onSuccess: ({ partyId }) => {
          setPartyCode('')
          void navigate({ to: '/party/$partyId', params: { partyId } })
        },
        onError: (err) => setJoinError(toJoinError(err)),
      },
    )
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleJoin()
  }

  function handleCodeChange(value: string) {
    setPartyCode(value)
    if (joinError) setJoinError(null)
  }

  function handleSignIn() {
    void navigate({ to: '/auth/$', search: { redirectTo: '/' } })
  }

  function handleConnectSpotify() {
    // Spotify OAuth initiation is deferred to Phase 9b.2.
    // This callback shape is wired; the real redirect will replace this body.
  }

  function handleCreateParty() {
    // Spec invariant: only one of join / create can be in flight at a time.
    if (createMutation.isPending || joinMutation.isPending) return
    setCreateError(null)
    createMutation.mutate(undefined, {
      onSuccess: ({ partyId }) => {
        void navigate({ to: '/party/$partyId', params: { partyId } })
      },
      onError: () =>
        setCreateError('Failed to create party. Please try again.'),
    })
  }

  // Auth status from the Neon Auth session via the typed getSession wrapper.
  // While the query is pending, lower-button state is 'checking'; once
  // resolved, authState reflects whether a session user exists.
  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: () => getSession(),
    staleTime: 60_000,
  })
  const authState: AuthState = sessionQuery.isLoading
    ? 'unknown'
    : sessionQuery.data
      ? 'authenticated'
      : 'unauthenticated'

  const lowerButtonState = deriveLowerButtonState(
    authState,
    isPremium,
    createMutation.isPending,
  )

  const isJoining = joinMutation.isPending
  const isCreating = createMutation.isPending

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <Card.Content className="flex flex-col items-center gap-6 py-10 text-center">
          <Text type="h1" weight="bold">
            CrowdTune
          </Text>

          <Text type="body" color="muted">
            Let your crowd shape the soundtrack, one vote at a time.
          </Text>

          <div className="flex flex-col gap-3 w-full">
            <Input
              aria-label="Party code"
              placeholder="Enter party code"
              inputMode="numeric"
              value={partyCode}
              onChange={(e) => handleCodeChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isJoining || isCreating}
              className="w-full"
            />

            <Button
              variant="primary"
              size="lg"
              isDisabled={!isCodeValid || isJoining || isCreating}
              onPress={handleJoin}
              className="w-full"
            >
              {isJoining ? (
                <>
                  <Spinner size="sm" />
                  Joining...
                </>
              ) : (
                'Join Party'
              )}
            </Button>

            {joinError && (
              <p className="text-sm text-red-500 text-center">
                {JOIN_ERROR_MESSAGES[joinError]}
              </p>
            )}
          </div>

          {isPlaybackCompatible && (
            <div className="flex flex-col gap-2 w-full">
              <LowerButton
                state={lowerButtonState}
                onSignIn={handleSignIn}
                onConnectSpotify={handleConnectSpotify}
                onCreateParty={handleCreateParty}
              />

              {createError && (
                <p className="text-sm text-red-500 text-center">{createError}</p>
              )}
            </div>
          )}
        </Card.Content>
      </Card>
    </main>
  )
}
