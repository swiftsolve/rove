import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IconTile, IconTileButton } from './IconTile'

describe('IconTile', () => {
  it('takes any colour, which its wash follows', () => {
    render(<IconTile color="var(--series-down)" icon={null} data-testid="tile" />)
    const tile = screen.getByTestId('tile')
    expect(tile.style.color).toBe('var(--series-down)')
    expect(tile).toHaveClass('bg-current/(--opacity-tint-md)')
  })

  it('is the sunken fill when neutral, with no colour of its own', () => {
    render(<IconTile color="neutral" icon={null} data-testid="tile" />)
    const tile = screen.getByTestId('tile')
    expect(tile.style.color).toBe('')
    expect(tile).toHaveClass('bg-inset', 'text-secondary')
  })

  it('lets a caller style win over its colour', () => {
    render(<IconTile color="var(--series-up)" icon={null} style={{ color: 'var(--series-down)' }} data-testid="tile" />)
    expect(screen.getByTestId('tile').style.color).toBe('var(--series-down)')
  })

  it('colours the button form the same way', () => {
    render(<IconTileButton color="var(--status-good)" label="Video calls: Good" onClick={vi.fn()} icon={null} />)
    expect(screen.getByRole('button', { name: 'Video calls: Good' }).style.color).toBe('var(--status-good)')
  })
})
