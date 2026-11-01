import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ViewLink } from './ViewLink'
import { GlobeIcon } from '../icons/Icons'

describe('ViewLink', () => {
  it('is a button named by its label, ending in a caret', () => {
    const { container } = render(<ViewLink icon={GlobeIcon}>All hosts</ViewLink>)
    expect(screen.getByRole('button', { name: 'All hosts' })).toHaveAttribute('type', 'button')
    expect(container.querySelectorAll('svg')).toHaveLength(2)
  })

  it('underlines only its label, never its glyphs', () => {
    render(<ViewLink icon={GlobeIcon}>All hosts</ViewLink>)
    const label = screen.getByText('All hosts')
    expect(label.tagName).toBe('SPAN')
    expect(label.className).toContain('group-hover/link:underline')
  })

  it('stays focusable while disabled, without acting', async () => {
    const onClick = vi.fn()
    render(
      <ViewLink isDisabled onClick={onClick}>
        All hosts
      </ViewLink>,
    )
    const link = screen.getByRole('button', { name: 'All hosts' })
    await userEvent.tab()
    expect(link).toHaveFocus()
    await userEvent.click(link)
    expect(onClick).not.toHaveBeenCalled()
  })
})
