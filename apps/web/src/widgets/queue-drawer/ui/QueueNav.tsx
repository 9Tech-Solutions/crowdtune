import { Text } from '@heroui/react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueueNavProps = {
  isOwner: boolean
  currentSubView: 'queue' | 'search' | 'settings' | 'share' | 'tv' | null
  queuePath: string
  settingsPath: string
  sharePath: string
  tvPath: string
  exitPath: string
  isUserMenuOpen: boolean
  onToggleUserMenu: () => void
  username: string | null
  onNavigate: (path: string) => void
  onEnterAdminMode: () => void
  onLogout: () => void
}

// ---------------------------------------------------------------------------
// Active-link helpers
// ---------------------------------------------------------------------------

type SubView = QueueNavProps['currentSubView']

function isQueueActive(subView: SubView): boolean {
  return subView === 'queue' || subView === 'search'
}

function isSettingsActive(subView: SubView): boolean {
  return subView === 'settings'
}

function isShareActive(subView: SubView): boolean {
  return subView === 'share'
}

// ---------------------------------------------------------------------------
// Icon primitives - minimal 24x24 SVGs, no third-party dependency.
// ---------------------------------------------------------------------------

function QueueIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  )
}

function AdminIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M20 6h-2.18c.07-.44.18-.88.18-1.33C18 2.54 15.86.5 13.25.5c-1.49 0-2.74.74-3.54 1.87L12 4.93l2.29-2.56C14.74 2.1 15.17 2 15.6 2c1.38 0 2.5 1.12 2.5 2.5C18.1 5.38 17.5 6 16.67 6H6.33C5.5 6 4.9 5.38 4.9 4.5 4.9 3.12 6.02 2 7.4 2c.43 0 .86.1 1.31.37L11 4.93 13.29 2.37C12.49 1.24 11.24.5 9.75.5 7.14.5 5 2.54 5 4.67c0 .45.11.89.18 1.33H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 16H4V8h16v14z" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
    </svg>
  )
}

function TvIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z" />
    </svg>
  )
}

function ExitIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={18} height={18} fill="currentColor">
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={20} height={20} fill="currentColor">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// NavLink
// ---------------------------------------------------------------------------

type NavLinkProps = {
  label: string
  icon: React.ReactNode
  // The real route path. Carried on the anchor as `href` so right-click,
  // middle-click, and keyboard tab focus all see a genuine navigation target.
  // Left-click is intercepted via onClick + preventDefault and dispatched
  // through the parent's SPA navigation callback instead of a full reload.
  href: string
  isActive?: boolean
  onClick: () => void
}

function NavLink({ label, icon, href, isActive = false, onClick }: NavLinkProps) {
  return (
    <a
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={[
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
        'no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        isActive
          ? 'text-accent font-medium'
          : 'text-muted hover:text-foreground hover:bg-default',
      ].join(' ')}
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
    >
      <span className={isActive ? 'text-accent' : 'text-muted'}>{icon}</span>
      {label}
    </a>
  )
}

// ---------------------------------------------------------------------------
// QueueNav
//
// The chrome-less navigation panel content. Renders the same nav surface in
// two contexts:
//   1. Inside QueueDrawer (narrow viewports) - wrapped by HeroUI Drawer chrome
//      that provides the slide-in overlay, backdrop, and React Aria focus
//      trap.
//   2. Directly in PartyPage (wide viewports) - rendered inside a plain
//      <aside> as a permanent sidebar, with NO modal pattern and NO focus
//      trap. This was the fix for the wide-viewport-drawer architecture
//      smell where a second QueueDrawer instance with isOpen={true} created
//      an unwanted focus trap.
// ---------------------------------------------------------------------------

export function QueueNav({
  isOwner,
  currentSubView,
  queuePath,
  settingsPath,
  sharePath,
  tvPath,
  exitPath,
  isUserMenuOpen,
  onToggleUserMenu,
  username,
  onNavigate,
  onEnterAdminMode,
  onLogout,
}: QueueNavProps) {
  const queueActive = isQueueActive(currentSubView)
  const settingsActive = isSettingsActive(currentSubView)
  const shareActive = isShareActive(currentSubView)

  // Per spec section 5 edge case: if username becomes null while user menu is
  // open, the user identity row disappears. Warn that the parent must reset
  // isUserMenuOpen to false when username transitions to null.
  if (username === null && isUserMenuOpen) {
    if (typeof console !== 'undefined') {
      console.warn(
        '[QueueNav] isUserMenuOpen is true but username is null. ' +
        'The parent must reset isUserMenuOpen to false when username becomes null.',
      )
    }
  }

  function handleNavigate(path: string) {
    onNavigate(path)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header: brand wordmark + user identity row */}
      <div className="flex flex-col gap-3 px-4 pt-4">
        <Text type="h3" weight="bold">
          CrowdTune
        </Text>

        <button
          type="button"
          aria-label={`User menu for ${username ?? 'account'}`}
          aria-expanded={isUserMenuOpen}
          onClick={onToggleUserMenu}
          className={[
            'flex items-center justify-between w-full rounded-lg px-2 py-1.5',
            'text-sm text-left transition-colors hover:bg-default',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            'motion-reduce:transition-none',
            username === null ? 'opacity-0 pointer-events-none' : 'opacity-100',
          ].join(' ')}
          style={{ transition: 'opacity 150ms ease' }}
        >
          <Text type="body-sm" color="muted" truncate>
            {username ?? ''}
          </Text>
          <span
            className={[
              'shrink-0 transition-transform duration-300 ease-in-out motion-reduce:transition-none',
              isUserMenuOpen ? 'rotate-180' : 'rotate-0',
            ].join(' ')}
          >
            <ChevronDownIcon />
          </span>
        </button>
      </div>

      {/* Body: main nav menu XOR user account menu */}
      <div className="relative flex-1 overflow-hidden mt-2">
        <nav
          aria-label="Party navigation"
          className={[
            'flex flex-col gap-1 absolute inset-0 px-2 py-2 overflow-y-auto',
            'transition-all duration-300 ease-in-out motion-reduce:transition-none',
            isUserMenuOpen
              ? 'opacity-0 pointer-events-none scale-y-95'
              : 'opacity-100 pointer-events-auto scale-y-100',
          ].join(' ')}
          style={{ transformOrigin: 'top center' }}
        >
          <NavLink
            label="Queue"
            icon={<QueueIcon />}
            href={queuePath}
            isActive={queueActive}
            onClick={() => handleNavigate(queuePath)}
          />

          {isOwner ? (
            <NavLink
              label="Settings"
              icon={<SettingsIcon />}
              href={settingsPath}
              isActive={settingsActive}
              onClick={() => handleNavigate(settingsPath)}
            />
          ) : (
            <a
              href="#"
              role="link"
              aria-label="Login for Admin Mode"
              className={[
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm no-underline',
                'text-muted hover:text-foreground hover:bg-default',
                'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
              onClick={(e) => {
                e.preventDefault()
                onEnterAdminMode()
              }}
            >
              <span className="text-muted"><AdminIcon /></span>
              Login for Admin Mode
            </a>
          )}

          <NavLink
            label="Share"
            icon={<ShareIcon />}
            href={sharePath}
            isActive={shareActive}
            onClick={() => handleNavigate(sharePath)}
          />

          <NavLink
            label="TV Mode"
            icon={<TvIcon />}
            href={tvPath}
            onClick={() => handleNavigate(tvPath)}
          />

          <NavLink
            label="Exit Party"
            icon={<ExitIcon />}
            href={exitPath}
            onClick={() => handleNavigate(exitPath)}
          />
        </nav>

        <div
          aria-label="User account menu"
          className={[
            'flex flex-col gap-1 absolute inset-0 px-2 py-2 overflow-y-auto',
            'transition-all duration-300 ease-in-out motion-reduce:transition-none',
            isUserMenuOpen
              ? 'opacity-100 pointer-events-auto scale-y-100'
              : 'opacity-0 pointer-events-none scale-y-95',
          ].join(' ')}
          style={{ transformOrigin: 'top center' }}
        >
          <a
            href="#"
            role="link"
            aria-label="Logout"
            className={[
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm no-underline',
              'text-muted hover:text-foreground hover:bg-default',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            ].join(' ')}
            onClick={(e) => {
              e.preventDefault()
              onLogout()
            }}
          >
            <span className="text-muted"><LogoutIcon /></span>
            Logout
          </a>
        </div>
      </div>
    </div>
  )
}
