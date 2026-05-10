import type { ReactNode } from 'react'
import { NeonAuthUIProvider } from '@neondatabase/auth-ui'
import { authClient } from '../lib/auth-client'

type Props = { children: ReactNode }

export function NeonAuthProvider({ children }: Props) {
  return (
    <NeonAuthUIProvider
      // The 0.2.0-beta auth-ui types do not yet line up with 0.6.0-beta neon-js;
      // the runtime contract works. Revisit when both packages reach 1.0.
      // @ts-expect-error - beta SDK type mismatch
      authClient={authClient}
      emailOTP
      social={{ providers: ['google', 'spotify'] }}
    >
      {children}
    </NeonAuthUIProvider>
  )
}
