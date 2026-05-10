import { createFileRoute } from '@tanstack/react-router'
import { AuthPage } from '@/pages/auth'

// eslint-disable-next-line react-refresh/only-export-components
function AuthRouteComponent() {
  // _splat is the path segment after /auth/ (e.g. "sign-in", "sign-up").
  const { _splat } = Route.useParams()
  return <AuthPage pathname={_splat} />
}

export const Route = createFileRoute('/auth/$')({
  component: AuthRouteComponent,
})
