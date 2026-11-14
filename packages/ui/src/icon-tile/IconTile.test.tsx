import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { IconTile, IconTileButton } from './IconTile'

describe('IconTile', () => {
  it('takes any colour, which its wash follows', () => {
    render(<IconTile color="var(--series-down)" icon={null} data-testid="tile" />)
    const tile = screen.getByTestId('tile')
    expect(tile.style.color).toBe('var(--series-down)')
    expect(tile).toHaveClass('bg-current/(--opacity-tint-md)')
  })

  it('is the sunken background when neutral, with no colour of its own', () => {
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

describe('IconTileButton', () => {
  it('is a button named by its label that opens on click', async () => {
    const onClick = vi.fn()
    render(<IconTileButton color="neutral" label="Video calls: Good" onClick={onClick} icon={<svg />} />)
    await userEvent.click(screen.getByRole('button', { name: 'Video calls: Good' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('stays in the Tab order while disabled, announced as disabled, and swallows clicks and Enter', async () => {
    const onClick = vi.fn()
    render(<IconTileButton color="neutral" label="Video calls: Testing" onClick={onClick} isDisabled icon={null} />)
    await userEvent.tab()
    const tile = screen.getByRole('button', { name: 'Video calls: Testing' })
    expect(tile).toHaveFocus()
    expect(tile).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(tile)
    await userEvent.keyboard('{Enter}')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('passes its ref and extra props through to the button', () => {
    const ref = createRef<HTMLButtonElement>()
    render(
      <IconTileButton
        ref={ref}
        color="neutral"
        label="Video calls: Good"
        onClick={vi.fn()}
        icon={null}
        aria-describedby="hint"
        data-testid="tile"
      />,
    )
    const tile = screen.getByTestId('tile')
    expect(ref.current).toBe(tile)
    expect(tile).toHaveAttribute('aria-describedby', 'hint')
    expect(tile).toHaveAttribute('type', 'button')
  })
})
