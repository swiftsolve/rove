import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { HomeIcon, SettingsIcon, SpeedIcon } from '../icons/Icons'
import { NavItem, NavRail } from './NavRail'

describe('NavRail', () => {
  it('is a named navigation landmark that marks the current page', () => {
    render(
      <NavRail
        label="Main navigation"
        main={[
          <NavItem key="home" label="Home" icon={HomeIcon} isActive onClick={vi.fn()} />,
          <NavItem key="speed" label="Speed" icon={SpeedIcon} onClick={vi.fn()} />,
        ]}
        footer={<NavItem label="Settings" icon={SettingsIcon} onClick={vi.fn()} />}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Speed' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'Settings' })).not.toHaveAttribute('aria-current')
  })
})

describe('NavRail keyboard', () => {
  function renderRail() {
    render(
      <>
        <NavRail
          label="Main navigation"
          main={[
            <NavItem key="home" label="Home" icon={HomeIcon} onClick={vi.fn()} />,
            <NavItem key="speed" label="Speed" icon={SpeedIcon} isActive onClick={vi.fn()} />,
          ]}
          footer={<NavItem label="Settings" icon={SettingsIcon} onClick={vi.fn()} />}
        />
        <button type="button">Page</button>
      </>,
    )
  }

  it('is one Tab stop, on the current page’s item', async () => {
    renderRail()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Speed' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Page' })).toHaveFocus()
  })

  it('moves between items with the arrows, Home and End, wrapping at the ends', async () => {
    renderRail()
    await userEvent.tab()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: 'Home' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('button', { name: 'Home' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus()
  })

  it('returns to the current page’s item after focus leaves', async () => {
    renderRail()
    await userEvent.tab()
    await userEvent.keyboard('{End}')
    await userEvent.tab()
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Speed' })).toHaveFocus()
  })
})

describe('NavItem', () => {
  it('is named by its label, and runs onClick on a click and on Enter', async () => {
    const onClick = vi.fn()
    render(<NavItem label="Speed" icon={SpeedIcon} onClick={onClick} />)
    const item = screen.getByRole('button', { name: 'Speed' })
    await userEvent.click(item)
    expect(onClick).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it("doesn't describe itself by its tooltip, which only repeats its name", () => {
    render(<NavItem label="Speed" icon={SpeedIcon} onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Speed' })).not.toHaveAttribute('aria-describedby')
  })
})
