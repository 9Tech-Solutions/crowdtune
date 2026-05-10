import { Card, buttonVariants } from '@heroui/react'

export function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <Card.Content className="flex flex-col items-center gap-4 py-10 text-center">
          <h1 className="text-4xl font-semibold">CrowdTune</h1>
          <p className="text-default-500">Phase 0 skeleton. No features yet.</p>
          <a
            href="/auth/sign-in"
            className={buttonVariants({ variant: 'primary', size: 'lg' })}
          >
            Sign in
          </a>
        </Card.Content>
      </Card>
    </main>
  )
}
