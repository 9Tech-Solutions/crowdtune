import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vite-plus/test'
import type { ReactNode } from 'react'
import { createTestQueryClient, TestQueryProvider } from '@/shared/test/test-providers'
import { useSpotifyStatus } from './use-spotify-status'
import { ApiError } from '@/shared/api'
import type { QueryClient } from '@tanstack/react-query'

vi.mock('@/shared/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/shared/api')>()
  return { ...mod, api: vi.fn() }
})

import { api } from '@/shared/api'
const mockApi = vi.mocked(api)

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <TestQueryProvider client={client}>{children}</TestQueryProvider>
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useSpotifyStatus', () => {
  it('returns_data_when_api_returns_200', async () => {
    const client = createTestQueryClient()
    mockApi.mockResolvedValueOnce({ isConnected: true, isPremium: false })

    const { result } = renderHook(() => useSpotifyStatus('user-123'), {
      wrapper: makeWrapper(client),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.data).toEqual({ isConnected: true, isPremium: false })
    expect(result.current.error).toBeNull()
  })

  it('returns_null_data_while_loading', () => {
    const client = createTestQueryClient()
    // api never resolves — keeps query in loading state
    mockApi.mockReturnValueOnce(new Promise(() => {}))

    const { result } = renderHook(() => useSpotifyStatus('user-123'), {
      wrapper: makeWrapper(client),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('returns_error_when_api_rejects', async () => {
    const client = createTestQueryClient()
    mockApi.mockRejectedValueOnce(new ApiError(500, 'internal_error', 'fail'))

    const { result } = renderHook(() => useSpotifyStatus('user-123'), {
      wrapper: makeWrapper(client),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeTruthy()
    expect(result.current.data).toBeNull()
  })

  it('stays_idle_when_userId_undefined', () => {
    const client = createTestQueryClient()

    const { result } = renderHook(() => useSpotifyStatus(undefined), {
      wrapper: makeWrapper(client),
    })

    // enabled: false — query never fires
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeNull()
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('caches_per_user_across_renders', async () => {
    // Shared QueryClient so cache is preserved between renders
    const sharedClient = createTestQueryClient()

    mockApi.mockResolvedValueOnce({ isConnected: true, isPremium: false })

    const { result: resultA, unmount } = renderHook(() => useSpotifyStatus('userA'), {
      wrapper: makeWrapper(sharedClient),
    })

    await waitFor(() => expect(resultA.current.isLoading).toBe(false))
    expect(resultA.current.data?.isConnected).toBe(true)

    unmount()

    // Second render with a different user on the same client
    mockApi.mockResolvedValueOnce({ isConnected: false, isPremium: false })

    const { result: resultB } = renderHook(() => useSpotifyStatus('userB'), {
      wrapper: makeWrapper(sharedClient),
    })

    await waitFor(() => expect(resultB.current.isLoading).toBe(false))
    // userB has a different cache entry — should NOT see userA's true value
    expect(resultB.current.data?.isConnected).toBe(false)
  })
})
