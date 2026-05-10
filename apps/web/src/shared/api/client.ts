import { authClient } from '@/shared/auth'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

type RequestInitWithBody = Omit<RequestInit, 'body'> & { body?: unknown }

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export async function api<T>(path: string, init: RequestInitWithBody = {}): Promise<T> {
  const session = await authClient.getSession()
  const token = session.data?.session?.token

  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const body = init.body === undefined ? undefined : JSON.stringify(init.body)

  const res = await fetch(url, { ...init, headers, body })

  if (!res.ok) {
    let payload: { code?: string; message?: string } = {}
    try {
      payload = (await res.json()) as typeof payload
    } catch {
      // body was not JSON; fall back to status text
    }
    throw new ApiError(
      res.status,
      payload.code ?? 'unknown',
      payload.message ?? res.statusText,
    )
  }

  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}
