import { AuthView } from '@neondatabase/neon-js/auth/react/ui'
import { Card } from '@heroui/react'

interface AuthPageProps {
  /** Path segment after /auth/ ("sign-in", "sign-up", "callback", etc.) used by AuthView to pick a view. */
  pathname: string | undefined
}

export function AuthPage({ pathname }: AuthPageProps) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <Card.Content className="p-6">
          <AuthView pathname={pathname} />
        </Card.Content>
      </Card>
    </main>
  )
}
