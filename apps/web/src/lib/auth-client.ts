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
