import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Outlet } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Spinner, Button, Modal, Text } from '@heroui/react'

import { QueueDrawer, QueueNav } from '@/widgets/queue-drawer'
import { PartyQueue } from '@/widgets/party-queue'
import { PlaybackProgressBar } from '@/widgets/playback-progress-bar'
import { getSession, signInWithSocial, type SessionUser } from '@/shared/auth'
import { usePartyQuery } from '../api/use-party-query'
import { usePlaybackQuery } from '../api/use-playback-query'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SubView = 'queue' | 'search' | 'settings' | 'share' | 'tv' | null
type SignInMode = 'normal' | 'follow-up'

// Providers configured in our Neon Auth deployment. Spotify is excluded:
// spotify is wired through Phase 9 endpoints, not Neon Auth social sign-in.
const ENABLED_PROVIDERS = ['google'] as const
type EnabledProvider = (typeof ENABLED_PROVIDERS)[number]

// ---------------------------------------------------------------------------
// MenuIcon
// ---------------------------------------------------------------------------
function MenuIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={24} height={24} fill="currentColor">
      <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Session hook: reads the current user via the vanilla Better Auth client.
// Uses TanStack Query so the session is cached and reactive.
// ---------------------------------------------------------------------------
function useSessionUser(): { user: SessionUser | null } {
  const { data } = useQuery({
    queryKey: ['session'],
    queryFn: () => getSession(),
    staleTime: 60_000,
  })
  return { user: data ?? null }
}

// ---------------------------------------------------------------------------
// Sub-view derivation from the current URL pathname
// ---------------------------------------------------------------------------
function useSubView(partyId: string): SubView {
  const { pathname } = useLocation()
  const base = `/party/${partyId}`
  if (pathname === `${base}/search`) return 'search'
  if (pathname === `${base}/settings`) return 'settings'
  if (pathname === `${base}/share`) return 'share'
  if (pathname === `${base}/tv`) return 'tv'
  if (pathname === base || pathname === `${base}/`) return 'queue'
  return null
}

// ---------------------------------------------------------------------------
// PartyPage
// ---------------------------------------------------------------------------

export function PartyPage() {
  const { partyId } = useParams({ from: '/party/$partyId' })
  const navigate = useNavigate()

  // ---- Server state ----------------------------------------------------------
  const { data: party, isLoading: partyLoading, error: partyError } = usePartyQuery(partyId)
  const { data: playback } = usePlaybackQuery(partyId)
  const { user } = useSessionUser()

  // ---- Derived values -------------------------------------------------------
  const username = user?.name ?? user?.email ?? null
  const currentUserId = user?.id ?? null
  const isOwner = party !== null && currentUserId !== null && party.hostUserId === currentUserId

  // ---- Page-local UI state --------------------------------------------------
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false)
  const [signInMode, setSignInMode] = useState<SignInMode>('normal')
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  // ---- Sub-view from router -------------------------------------------------
  const currentSubView = useSubView(partyId)

  // ---- Path builders (type-safe strings, not hardcoded) --------------------
  const queuePath = `/party/${partyId}`
  const settingsPath = `/party/${partyId}/settings`
  const sharePath = `/party/${partyId}/share`
  const tvPath = `/party/${partyId}/tv`
  const exitPath = '/'

  // ---- Escape key handler ---------------------------------------------------
  // Re-binds when either flag changes so the handler always closes over current
  // state. Cheap and ESLint-clean (no ref-mutation-during-render).
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (isSignInModalOpen) {
        setIsSignInModalOpen(false)
      } else if (isDrawerOpen) {
        setIsDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [isSignInModalOpen, isDrawerOpen])

  // ---- No-op callbacks (feature layer not yet ported) ----------------------
  const onVote = () => { /* feature layer not yet ported */ }
  const onRemove = () => { /* feature layer not yet ported */ }
  const onTogglePlayback = () => { /* feature layer not yet ported */ }
  const onTransferPlayback = () => { /* feature layer not yet ported */ }

  // ---- Sign-in trigger surface (callable by feature-layer once ported) -----
  function triggerSignIn(mode: SignInMode) {
    setSignInMode(mode)
    setIsSignInModalOpen(true)
  }

  // ---- Navigation -----------------------------------------------------------
  function handleNavigate(path: string) {
    setIsDrawerOpen(false)
    navigate({ to: path as never })
  }

  // ---- OAuth provider sign-in ----------------------------------------------
  function handleProviderSignIn(provider: EnabledProvider) {
    void signInWithSocial(provider, window.location.href)
  }

  // ---- Provider button disabled state -------------------------------------
  // Follow-up mode requires the chosen provider to be one the user has
  // previously linked. We don't have linked-provider data wired yet; once
  // the auth feature layer surfaces it, this gains a provider argument and
  // a real linked-provider check. For now no provider is disabled.
  function isProviderDisabled(): boolean {
    return false
  }

  // ---- Shared QueueDrawer props --------------------------------------------
  const drawerProps = {
    isOwner,
    currentSubView,
    queuePath,
    settingsPath,
    sharePath,
    tvPath,
    exitPath,
    isUserMenuOpen,
    onToggleUserMenu: () => setIsUserMenuOpen((v) => !v),
    username,
    onNavigate: handleNavigate,
    onEnterAdminMode: () => triggerSignIn('normal'),
    onLogout: () => { /* logout not yet ported */ },
  }

  // Short-circuit for TV mode: TvPage fills the viewport with no chrome.
  // Spec lock-now: views-view-tv.spec.md section 10 ("Route is /party/$partyId/tv,
  // standalone full-viewport page outside the party shell").
  if (currentSubView === 'tv') {
    return <Outlet />
  }

  // ---- Render: error state --------------------------------------------------
  if (partyError) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <Text type="h2">Party not found</Text>
          <Text type="body" color="muted">
            This party may have ended or the link is no longer valid.
          </Text>
          <Button variant="secondary" onPress={() => navigate({ to: '/' })}>
            Go home
          </Button>
        </div>
      </main>
    )
  }

  // ---- Render: main layout --------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col">
      {/* Narrow viewport: slide-in drawer with HeroUI modal chrome */}
      <div className="md:hidden">
        <QueueDrawer
          {...drawerProps}
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
        />
      </div>

      {/* Wide viewport: permanent sidebar - QueueNav rendered directly, NO
          modal chrome. Avoids the focus trap that HeroUI's Drawer.Backdrop
          would create when held open on wide screens. */}
      <aside
        aria-label="Party navigation"
        className="hidden md:block fixed left-0 top-0 bottom-0 w-72 z-30 bg-background border-r border-default"
      >
        <QueueNav {...drawerProps} />
      </aside>

      {/* Fixed header: full-width on narrow, offset right of drawer on wide */}
      <header className="fixed top-0 right-0 left-0 md:left-72 z-20 bg-background border-b border-default">
        <div className="flex items-center gap-2 px-4 py-3">
          {/* Hamburger button: visible only on narrow viewports */}
          <button
            type="button"
            aria-label="Open menu"
            className="md:hidden text-muted hover:text-foreground"
            onClick={() => setIsDrawerOpen(true)}
          >
            <MenuIcon />
          </button>

          <div className="flex-1 text-center">
            {partyLoading ? (
              <span className="text-muted text-sm">Loading...</span>
            ) : (
              <Text type="h4" weight="bold">
                {party?.name ?? ''}
              </Text>
            )}
          </div>
        </div>

        {/* The current track's duration is not yet available - it will arrive
            with the per-track metadata query when the backend lands. For now
            the widget receives null and renders an invisible 0% strip,
            preserving the 1px layout reservation. */}
        <PlaybackProgressBar playback={playback} durationMs={null} />
      </header>

      {/* Main content: top offset accounts for fixed header height */}
      <main className="flex-1 pt-[var(--party-header-height,4.5rem)] md:pl-72">
        {partyLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : currentSubView === 'queue' || currentSubView === null ? (
          <PartyQueue
            tracksLoaded
            isOwner={isOwner}
            settingsRoutePath={settingsPath}
            tracks={[]}
            metadata={{}}
            playback={playback}
            votes={{}}
            pendingVotes={{}}
            isPlaybackMaster={false}
            hasOtherPlaybackMaster={false}
            hasConnectedSpotify={false}
            isCompatible={false}
            isMusicPlaying={playback?.playing ?? false}
            isTogglingPlayback={false}
            isPlayButtonEnabled={false}
            onVote={onVote}
            onRemove={onRemove}
            onTogglePlayback={onTogglePlayback}
            onTransferPlayback={onTransferPlayback}
            onNavigate={handleNavigate}
          />
        ) : (
          <Outlet />
        )}
      </main>

      {/* Sign-in modal */}
      <Modal.Backdrop
        isOpen={isSignInModalOpen}
        onOpenChange={(open) => setIsSignInModalOpen(open)}
        isDismissable
      >
        <Modal.Container>
          <Modal.Dialog aria-label="Sign in to continue">
            <Modal.Header>
              <Modal.Heading>
                {signInMode === 'follow-up'
                  ? 'Further action required'
                  : 'Please sign in to vote'}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Text type="body-sm" color="muted">
                {signInMode === 'follow-up'
                  ? 'Please sign in with one of your previously linked social accounts to continue.'
                  : 'The party host requires guests to sign in before voting.'}
              </Text>
              <div className="flex flex-col gap-2 mt-4">
                {ENABLED_PROVIDERS.map((provider) => (
                  <Button
                    key={provider}
                    variant="outline"
                    isDisabled={isProviderDisabled()}
                    onPress={() => handleProviderSignIn(provider)}
                  >
                    Continue with {provider.charAt(0).toUpperCase() + provider.slice(1)}
                  </Button>
                ))}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                Cancel
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  )
}

