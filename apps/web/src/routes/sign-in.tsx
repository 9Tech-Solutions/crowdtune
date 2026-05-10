import { createFileRoute } from '@tanstack/react-router'
import { AuthView } from '@neondatabase/auth-ui'

// eslint-disable-next-line react-refresh/only-export-components
function SignIn() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-sm p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
        <h1 className="text-2xl font-semibold mb-4">Sign in to CrowdTune</h1>
        <AuthView />
      </div>
    </main>
  )
}

export const Route = createFileRoute('/sign-in')({
  component: SignIn,
})
