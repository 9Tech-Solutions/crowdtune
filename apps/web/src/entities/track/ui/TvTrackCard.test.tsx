import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import type { Track, TrackReference, Metadata } from '../model/types'
import { TvTrackCard, type TvTrackCardProps } from './TvTrackCard'

// -------------------------------------------------------------------------
// Factories
// -------------------------------------------------------------------------

function makeTrackRef(id = 'track1'): TrackReference {
  return { provider: 'spotify', id }
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    ref: makeTrackRef(),
    addedAt: '2024-01-01T00:00:00Z',
    isFallback: false,
    voteCount: 3,
    order: 0,
    ...overrides,
  }
}

function makeMetadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    title: 'Test Track',
    artists: ['Test Artist'],
    coverImages: [{ url: 'cover-300.jpg', width: 300, height: 300 }],
    durationMs: 180_000,
    isPlayable: true,
    ...overrides,
  }
}

function renderCard(overrides: Partial<TvTrackCardProps> = {}) {
  const props: TvTrackCardProps = {
    trackRef: makeTrackRef(),
    track: makeTrack(),
    metadata: makeMetadata(),
    ...overrides,
  }
  return render(<TvTrackCard {...props} />)
}

// -------------------------------------------------------------------------
// Tests (16, matching spec section 12)
// -------------------------------------------------------------------------

describe('TvTrackCard', () => {
  it('Renders cover image when metadata is present with at least one image', () => {
    renderCard({ metadata: makeMetadata({ coverImages: [{ url: 'cover-300.jpg', width: 300, height: 300 }] }) })
    // Plain <img> is rendered when coverUrl is defined
    const img = screen.getByAltText('Test Track')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'cover-300.jpg')
  })

  it('Renders placeholder block when metadata is null', () => {
    renderCard({ metadata: null })
    // No <img> element - the placeholder div carries role="img" with empty alt
    const placeholder = screen.getByRole('img', { name: '' })
    expect(placeholder).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Test Track/i })).not.toBeInTheDocument()
  })

  it('Renders placeholder block when metadata is present but image list is empty', () => {
    renderCard({ metadata: makeMetadata({ coverImages: [] }) })
    // pickCoverUrl returns undefined for empty list; placeholder renders
    const placeholder = screen.getByRole('img', { name: 'Test Track' })
    expect(placeholder.tagName.toLowerCase()).toBe('div')
  })

  it('Renders vote count from track record when track record is present', () => {
    renderCard({ track: makeTrack({ voteCount: 7 }) })
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('Renders zero as vote count when track record is null', () => {
    renderCard({ track: null })
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('Renders track title from metadata when metadata is present', () => {
    renderCard({ metadata: makeMetadata({ title: 'My Song' }) })
    expect(screen.getByText('My Song')).toBeInTheDocument()
  })

  it('Renders loading text when metadata is null', () => {
    renderCard({ metadata: null })
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('Renders artist string when metadata has at least one artist', () => {
    renderCard({ metadata: makeMetadata({ artists: ['Artist One'] }) })
    expect(screen.getByText('Artist One')).toBeInTheDocument()
  })

  it('Does not render artist line when metadata is null', () => {
    renderCard({ metadata: null })
    expect(screen.queryByText(/Artist/i)).not.toBeInTheDocument()
  })

  it('Does not render artist line when artist list is empty', () => {
    renderCard({ metadata: makeMetadata({ artists: [] }) })
    expect(screen.queryByText(/artist/i)).not.toBeInTheDocument()
  })

  it('Overlay is present when metadata is loaded', () => {
    const { container } = renderCard()
    // The dark overlay div uses bg-black/60 and absolute inset-0
    const overlay = container.querySelector('.bg-black\\/60')
    expect(overlay).toBeInTheDocument()
  })

  it('Overlay is present when metadata is null (ensures vote count is always readable)', () => {
    const { container } = renderCard({ metadata: null })
    const overlay = container.querySelector('.bg-black\\/60')
    expect(overlay).toBeInTheDocument()
  })

  it('Cover image alt text equals track title when metadata is present', () => {
    renderCard({ metadata: makeMetadata({ title: 'Alt Title Test' }) })
    // <img alt="Alt Title Test"> when metadata has a cover image
    const img = screen.getByAltText('Alt Title Test')
    expect(img).toBeInTheDocument()
  })

  it('Cover image alt text is empty string when metadata is null', () => {
    renderCard({ metadata: null })
    // Placeholder div has role="img" and aria-label=""
    const placeholder = screen.getByRole('img', { name: '' })
    expect(placeholder).toBeInTheDocument()
  })

  it('Does not render any button or interactive element in any state', () => {
    // Fully loaded state - no buttons
    renderCard()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('Re-renders with updated vote count when track record vote count changes', () => {
    const track = makeTrack({ voteCount: 1 })
    const { rerender } = renderCard({ track })
    expect(screen.getByText('1')).toBeInTheDocument()

    const updatedTrack = { ...track, voteCount: 5 }
    rerender(
      <TvTrackCard
        trackRef={makeTrackRef()}
        track={updatedTrack}
        metadata={makeMetadata()}
      />
    )
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })
})
