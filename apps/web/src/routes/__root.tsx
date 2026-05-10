import { createRootRoute, Outlet } from '@tanstack/react-router'
import { NeonAuthProvider } from '../providers/NeonAuthProvider'

// eslint-disable-next-line react-refresh/only-export-components
function RootLayout() {
  return (
    <NeonAuthProvider>
      <Outlet />
    </NeonAuthProvider>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
