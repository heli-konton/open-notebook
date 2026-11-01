import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { EpisodeProgress, normalizeProgress } from './EpisodeProgress'

describe('EpisodeProgress', () => {
  it('renders 0%', () => {
    render(<EpisodeProgress status="running" progress={0} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('renders a mid value rounded', () => {
    render(<EpisodeProgress status="processing" progress={42.4} />)
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
  })

  it('renders 100% while still not finished', () => {
    render(<EpisodeProgress status="running" progress={100} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('falls back to an indeterminate bar when progress is null', () => {
    render(<EpisodeProgress status="pending" progress={null} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('data-indeterminate', 'true')
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
  })

  it('renders nothing for completed or failed episodes', () => {
    const { rerender } = render(<EpisodeProgress status="completed" progress={100} />)
    expect(screen.queryByTestId('episode-progress')).not.toBeInTheDocument()
    rerender(<EpisodeProgress status="failed" progress={10} />)
    expect(screen.queryByTestId('episode-progress')).not.toBeInTheDocument()
  })

  it('normalizes out-of-range values', () => {
    expect(normalizeProgress(150)).toBe(100)
    expect(normalizeProgress(-5)).toBe(0)
    expect(normalizeProgress(undefined)).toBeNull()
    expect(normalizeProgress(Number.NaN)).toBeNull()
  })
})
