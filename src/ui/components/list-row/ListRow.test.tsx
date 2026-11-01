import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ListRow } from './ListRow'

describe('ListRow', () => {
  it('opens on click, named by its content', async () => {
    const onClick = vi.fn()
    render(<ListRow onClick={onClick}>Streaming in 4K</ListRow>)
    await userEvent.click(screen.getByRole('button', { name: 'Streaming in 4K' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('stays focusable but inert while disabled', async () => {
    const onClick = vi.fn()
    render(
      <ListRow onClick={onClick} isDisabled>
        Gaming
      </ListRow>,
    )
    const row = screen.getByRole('button', { name: 'Gaming' })
    row.focus()
    expect(row).toHaveFocus()
    await userEvent.click(row)
    expect(onClick).not.toHaveBeenCalled()
  })
})
