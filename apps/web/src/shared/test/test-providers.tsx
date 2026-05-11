// Test-only file: HMR is not a concern here, so the react-refresh
// "only-export-components" rule is irrelevant. Mixing the QueryClient factory
// with the provider component keeps tests ergonomic.
/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Minimal QueryClient wrapper for unit tests.
 * Creates a fresh client per usage so tests don't share state.
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
}

type Props = { children: ReactNode; client?: QueryClient }

export function TestQueryProvider({ children, client }: Props) {
  const qc = client ?? createTestQueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}
