import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Menu, MenuContent, MenuItem, MenuTrigger } from './Menu'
import { TrashIcon } from '../../icons/Icons'

function renderMenu(onEdit = vi.fn(), onRemove = vi.fn()): void {
  render(
    <Menu>
      <MenuTrigger label="Options for Google" />
      <MenuContent>
        <MenuItem onClick={onEdit}>Edit</MenuItem>
        <MenuItem icon={TrashIcon} tone="negative" onClick={onRemove}>
          Remove
        </MenuItem>
      </MenuContent>
    </Menu>,
  )
}

describe('Menu', () => {
  it('opens from its named kebab and lists its actions', async () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: 'Options for Google' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    await userEvent.click(trigger)
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Edit', 'Remove'])
  })

  it('runs an action and closes', async () => {
    const onRemove = vi.fn()
    renderMenu(vi.fn(), onRemove)
    await userEvent.click(screen.getByRole('button', { name: 'Options for Google' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('works from the keyboard and hands focus back on Escape', async () => {
    const onEdit = vi.fn()
    renderMenu(onEdit)
    const trigger = screen.getByRole('button', { name: 'Options for Google' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('menu')
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(onEdit).not.toHaveBeenCalled()
  })
})
