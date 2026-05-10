import type { ReactNode } from 'react'
import { NeonAuthUIProvider } from '@neondatabase/neon-js/auth/react'
import { useNavigate, Link as TanStackLink } from '@tanstack/react-router'
import type { LinkProps as TanStackLinkProps } from '@tanstack/react-router'
import { authClient } from '@/shared/auth'

type Props = { children: ReactNode }

// Adapter: better-auth-ui calls Link with `href`; TanStack Router's Link wants `to`.
function AuthLink({ href, ...rest }: { href: string } & Omit<TanStackLinkProps, 'to'>) {
  return <TanStackLink to={href as TanStackLinkProps['to']} {...rest} />
}

export function NeonAuthProvider({ children }: Props) {
  const navigate = useNavigate()

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      emailOTP
      // Spotify is declared as a future provider in the Phase 9 plan but is
      // not yet configured in Neon Auth's console. Listing only Google here
      // prevents the UI from rendering a Spotify button that 502s on click.
      social={{ providers: ['google'] }}
      navigate={(href) => navigate({ to: href as never })}
      replace={(href) => navigate({ to: href as never, replace: true })}
      Link={AuthLink as never}
    >
      {children}
    </NeonAuthUIProvider>
  )
}
