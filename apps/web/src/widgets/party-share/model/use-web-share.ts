/**
 * useWebShare - thin wrapper around the browser's Web Share API.
 *
 * Evaluated inside a component render (not at module scope) so the check
 * reflects the runtime environment of the current render, which is also
 * compatible with SSR contexts where navigator may be undefined.
 *
 * share() wraps the native call in try/catch. A dismissed or rejected share
 * sheet is swallowed silently via console.warn per spec open question 4.
 * No toast is shown - the view returns to the ready state without feedback.
 */

export type WebSharePayload = {
  title: string
  text: string
  url: string
}

export type UseWebShareResult = {
  isSupported: boolean
  share: (payload: WebSharePayload) => Promise<void>
}

export function useWebShare(): UseWebShareResult {
  const isSupported =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function share(payload: WebSharePayload): Promise<void> {
    if (!isSupported) return
    try {
      await navigator.share(payload)
    } catch (err: unknown) {
      // A dismissed share sheet rejects the promise on most platforms.
      // We swallow silently - no toast, no error state. (spec OQ-4)
      console.warn('[PartyShare] Share dismissed or failed:', err)
    }
  }

  return { isSupported, share }
}
