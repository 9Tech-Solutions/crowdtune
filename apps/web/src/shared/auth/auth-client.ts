import { createAuthClient } from '@neondatabase/neon-js/auth'

const url = import.meta.env.VITE_NEON_AUTH_URL ?? ''

if (!url) {
  // Phase 8a is a manual step: provision Neon Auth in the console and paste
  // the URL into .env. Until then, auth API calls will fail at runtime, but
  // the bundle still builds.
  console.warn(
    '[auth] VITE_NEON_AUTH_URL is empty. Sign-in/up will not work until Phase 8a is done.',
  )
}

export const authClient = createAuthClient(url)

// ---------------------------------------------------------------------------
// Typed wrappers around the underlying Better Auth vanilla client.
//
// createAuthClient returns a NeonAuth<T> wrapper whose getSession + signIn
// methods live on `.adapter`, not at the top level. The Neon Auth types are
// loose, so we cast the adapter once here and expose ergonomic, typed helpers
// rather than scattering `as unknown as` casts across every call site.
// ---------------------------------------------------------------------------

export type SessionUser = {
  id: string
  name: string
  email: string
  image?: string | null
}

export type Session = {
  user: SessionUser
}

type AuthAdapter = {
  getSession: () => Promise<{ data: Session | null }>
  signIn: {
    social: (opts: { provider: string; callbackURL: string }) => Promise<unknown>
  }
}

const adapter = (authClient as unknown as { adapter: AuthAdapter }).adapter

export async function getSession(): Promise<SessionUser | null> {
  const result = await adapter.getSession()
  return result?.data?.user ?? null
}

export function signInWithSocial(
  provider: string,
  callbackURL: string,
): Promise<unknown> {
  return adapter.signIn.social({ provider, callbackURL })
}
