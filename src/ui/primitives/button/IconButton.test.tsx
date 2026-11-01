import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IconButton } from './IconButton'
import { RefreshIcon } from '../../icons/Icons'

describe('IconButton', () => {
  it('is named by its label, which is also its tooltip', async () => {
    render(<IconButton label="Refresh" icon={RefreshIcon} />)
    const button = screen.getByRole('button', { name: 'Refresh' })
    // The tooltip repeats the name, so it isn't read twice.
    expect(button).not.toHaveAttribute('aria-describedby')
    await userEvent.hover(button)
    expect(await screen.findByText('Refresh', { selector: '[data-open]' })).toBeVisible()
  })

  it('describes itself with a richer tooltip', () => {
    render(<IconButton label="About scanning" icon={RefreshIcon} tooltip="Rove asks your router." />)
    expect(screen.getByRole('button')).toHaveAccessibleDescription('Rove asks your router.')
  })

  it('passes its ref through the tooltip to the <button>', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<IconButton ref={ref} label="Refresh" icon={RefreshIcon} />)
    expect(ref.current).toBe(screen.getByRole('button'))
  })

  it('still explains itself while disabled, without acting', async () => {
    const onClick = vi.fn()
    render(<IconButton label="Refresh" icon={RefreshIcon} isDisabled onClick={onClick} />)
    const button = screen.getByRole('button')
    await userEvent.hover(button)
    expect(await screen.findByText('Refresh', { selector: '[data-open]' })).toBeVisible()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
