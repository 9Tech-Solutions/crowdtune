import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { HomePage } from './HomePage'

describe('HomePage', () => {
  test('renders the CrowdTune heading', () => {
    render(<HomePage />)
    expect(screen.getByRole('heading', { name: /crowdtune/i })).toBeInTheDocument()
  })
})
