import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import type { Metadata, TrackReference } from '@/entities/track'
import { TestQueryProvider } from '@/shared/test/test-providers'
import { SearchResultRow } from './SearchResultRow'

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const TRACK_REF: TrackReference = { provider: 'spotify', id: 'test-track-1' }

function makeMetadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    title: 'Bohemian Rhapsody',
    artists: ['Queen'],
    coverImages: [],
    durationMs: 354_000,
    isPlayable: true,
    ...overrides,
  }
}

function renderRow(props: Partial<Parameters<typeof SearchResultRow>[0]> = {}) {
  const defaults = {
    metadata: makeMetadata(),
    trackRef: TRACK_REF,
    voteCount: 0,
    isAlreadyQueued: false,
    isAddPending: false,
    onAdd: vi.fn(),
    ...props,
  }
  return render(
    <TestQueryProvider>
      <SearchResultRow {...defaults} />
    </TestQueryProvider>,
  )
}

// ---------------------------------------------------------------------------
// 13. Renders title + artists from metadata
// ---------------------------------------------------------------------------

describe('title and artists', () => {
  it('renders the track title', () => {
    renderRow()
    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument()
  })

  it('renders the formatted artist string', () => {
    renderRow({ metadata: makeMetadata({ artists: ['Queen', 'David Bowie'] }) })
    expect(screen.getByText(/Queen feat\. David Bowie/)).toBeInTheDocument()
  })

  it('renders a single artist without feat. prefix', () => {
    renderRow({ metadata: makeMetadata({ artists: ['Queen'] }) })
    expect(screen.getByText('Queen')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 14. Renders cover image via Avatar when metadata has coverImages
// ---------------------------------------------------------------------------

describe('cover image', () => {
  it('renders the Avatar in default variant (not soft) when coverImages are present', () => {
    // Radix Avatar.Image does not render an <img> in jsdom (requires image loading).
    // We verify the behavior by checking the Avatar's CSS variant class instead:
    // default variant = "avatar" without "avatar--soft"; soft = "avatar avatar--soft".
    const { container } = renderRow({
      metadata: makeMetadata({
        coverImages: [{ url: 'https://example.com/cover.jpg', width: 64, height: 64 }],
      }),
    })
    const avatarEl = container.querySelector('.avatar')
    expect(avatarEl).not.toBeNull()
    expect(avatarEl?.classList.contains('avatar--soft')).toBe(false)
  })

  it('renders the Avatar in soft variant when coverImages is empty', () => {
    const { container } = renderRow({ metadata: makeMetadata({ coverImages: [] }) })
    const avatarEl = container.querySelector('.avatar')
    expect(avatarEl).not.toBeNull()
    expect(avatarEl?.classList.contains('avatar--soft')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 15. Renders Avatar.Fallback when metadata is null
// ---------------------------------------------------------------------------

describe('null metadata fallback', () => {
  it('shows "Loading track" text when metadata is null', () => {
    renderRow({ metadata: null })
    expect(screen.getByText('Loading track')).toBeInTheDocument()
  })

  it('does not render an img when metadata is null', () => {
    const { container } = renderRow({ metadata: null })
    expect(container.querySelector('img')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 16. Add button accessible name includes track title + artist
// ---------------------------------------------------------------------------

describe('add button accessible name', () => {
  it('includes the track title and artist in the add button aria-label', () => {
    renderRow()
    expect(
      screen.getByRole('button', { name: /Add Bohemian Rhapsody by Queen to queue/i }),
    ).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 17. Add pending state: button disabled + "Adding..." aria-label + Spinner visible
// ---------------------------------------------------------------------------

describe('add pending state', () => {
  it('shows "Adding..." in the button aria-label when isAddPending', () => {
    renderRow({ isAddPending: true })
    expect(screen.getByRole('button', { name: /Adding Bohemian Rhapsody\.\.\./i })).toBeInTheDocument()
  })

  it('disables the button while pending', () => {
    renderRow({ isAddPending: true })
    const btn = screen.getByRole('button', { name: /Adding Bohemian Rhapsody\.\.\./i })
    expect(btn).toBeDisabled()
  })

  it('renders a spinner while pending', () => {
    const { container } = renderRow({ isAddPending: true })
    expect(container.querySelector('[data-slot="spinner"]')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 18. Already-queued variant: button shows vote count + ghost variant
// ---------------------------------------------------------------------------

describe('already queued variant', () => {
  it('shows the vote count in the button when already queued', () => {
    renderRow({ isAlreadyQueued: true, voteCount: 3 })
    expect(screen.getByRole('button', { name: /3 votes - already queued/i })).toBeInTheDocument()
  })

  it('shows singular "vote" when voteCount is 1', () => {
    renderRow({ isAlreadyQueued: true, voteCount: 1 })
    expect(screen.getByRole('button', { name: /1 vote - already queued/i })).toBeInTheDocument()
  })

  it('disables the button when already queued', () => {
    renderRow({ isAlreadyQueued: true, voteCount: 2 })
    const btn = screen.getByRole('button', { name: /2 votes - already queued/i })
    expect(btn).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// 19. Tapping add button fires onAdd with the track reference
// ---------------------------------------------------------------------------

describe('onAdd callback', () => {
  it('calls onAdd with the trackRef when the add button is pressed', async () => {
    const onAdd = vi.fn()
    renderRow({ onAdd })
    await userEvent.click(screen.getByRole('button', { name: /Add Bohemian Rhapsody/i }))
    expect(onAdd).toHaveBeenCalledWith(TRACK_REF)
  })

  it('does not call onAdd when button is pending', async () => {
    const onAdd = vi.fn()
    renderRow({ isAddPending: true, onAdd })
    const btn = screen.getByRole('button', { name: /Adding Bohemian Rhapsody/i })
    await userEvent.click(btn)
    expect(onAdd).not.toHaveBeenCalled()
  })
})
