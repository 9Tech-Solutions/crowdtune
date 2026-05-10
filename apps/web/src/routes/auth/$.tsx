import { createFileRoute } from '@tanstack/react-router'
import { AuthView } from '@neondatabase/neon-js/auth/react/ui'

// eslint-disable-next-line react-refresh/only-export-components
function AuthCatchAll() {
  // _splat is the path segment after /auth/ (e.g. "sign-in", "sign-up").
  // AuthView uses pathname to pick which view to render.
  const { _splat } = Route.useParams()
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 px-4">
      <div className="w-full max-w-md p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
        <AuthView pathname={_splat} />
      </div>
    </main>
  )
}

export const Route = createFileRoute('/auth/$')({
  component: AuthCatchAll,
})
