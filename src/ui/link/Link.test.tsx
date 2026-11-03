import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { GlobeIcon } from '../icons/Icons'
import { Link } from './Link'

describe('Link', () => {
  it('opens a view as a button named by its label, ending in a caret', () => {
    const { container } = render(<Link icon={GlobeIcon}>All hosts</Link>)
    expect(screen.getByRole('button', { name: 'All hosts' })).toHaveAttribute('type', 'button')
    expect(container.querySelectorAll('svg')).toHaveLength(2)
  })

  it('opens an address in a new window, ending in an arrow, and says so', () => {
    const { container } = render(<Link href="https://example.com">Example</Link>)
    const link = screen.getByRole('link', { name: 'Example (opens in a new window)' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })

  it('underlines only its label, never its icons', () => {
    render(<Link icon={GlobeIcon}>All hosts</Link>)
    const label = screen.getByText('All hosts')
    expect(label.tagName).toBe('SPAN')
    expect(label.className).toContain('group-hover/link:underline')
  })

  it('stays focusable while disabled, without acting', async () => {
    const onClick = vi.fn()
    render(
      <Link isDisabled onClick={onClick}>
        All hosts
      </Link>,
    )
    const link = screen.getByRole('button', { name: 'All hosts' })
    await userEvent.tab()
    expect(link).toHaveFocus()
    await userEvent.click(link)
    expect(onClick).not.toHaveBeenCalled()
  })
})
