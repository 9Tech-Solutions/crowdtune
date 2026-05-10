import { createFileRoute } from '@tanstack/react-router'
import { AuthView } from '@neondatabase/neon-js/auth/react/ui'
import { Card } from '@heroui/react'

// eslint-disable-next-line react-refresh/only-export-components
function AuthCatchAll() {
  // _splat is the path segment after /auth/ (e.g. "sign-in", "sign-up").
  // AuthView uses pathname to pick which view to render.
  const { _splat } = Route.useParams()
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <Card.Content className="p-6">
          <AuthView pathname={_splat} />
        </Card.Content>
      </Card>
    </main>
  )
}

export const Route = createFileRoute('/auth/$')({
  component: AuthCatchAll,
})
