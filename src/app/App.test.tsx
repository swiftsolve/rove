import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { App } from '@/app/App'
import { queryClient } from '@/app/utils/query-client'
import { installMockNetworkApiIfNeeded } from '@/dev/mock-network-api'

// The whole app against the dev mock bridge, as the screenshots run it: these
// check what a user does, across views, providers and the query cache.

beforeAll(() => {
  installMockNetworkApiIfNeeded()
})

beforeEach(() => {
  // Navigation lives in history state and the theme in localStorage, so each
  // test starts on Home with the defaults.
  window.history.replaceState(null, '')
  localStorage.clear()
})

afterEach(() => {
  queryClient.clear()
})

async function renderApp() {
  render(<App />)
  await screen.findByRole('heading', { level: 1, name: 'Home' }, { timeout: 5000 })
  return userEvent.setup()
}

/** Waits for the page heading to read `title`: some fill in a count once their data lands. */
async function expectHeading(title: string | RegExp) {
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title), { timeout: 5000 })
}

describe('App', () => {
  it.each([
    ['Speed', 'Speed'],
    ['Devices', /devices$/],
    ['Apps', 'Apps'],
    ['Services', 'Services'],
    ['Timeline', 'Timeline'],
    ['Interfaces', /interfaces$/],
    ['Connection', 'Connection'],
    ['Usage', 'Usage'],
    ['Settings', 'Settings'],
  ])('opens %s from the nav rail', async (tab, title) => {
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: tab }))
    await expectHeading(title)
  })

  it('opens a tab from its Home card', async () => {
    const user = await renderApp()
    await user.click(screen.getByRole('link', { name: /Open Devices\.$/ }))
    await expectHeading(/devices$/)
  })

  it('expands the connection card and collapses it again', async () => {
    const user = await renderApp()
    const toggle = screen.getByRole('button', { name: 'Connection details' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('switches the theme from the nav rail', async () => {
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(await screen.findByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
  })

  it('adds a service, then removes it from its menu', async () => {
    const user = await renderApp()
    await user.click(screen.getByRole('button', { name: 'Services' }))
    await user.click(await screen.findByRole('button', { name: 'Add service' }))

    const dialog = await screen.findByRole('dialog', { name: 'Add a service' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Address' }), 'example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Add service' }))
    // The mock can't reach it, so the test holds it for a second confirm.
    await user.click(await within(dialog).findByRole('button', { name: 'Add anyway' }, { timeout: 5000 }))
    const kebab = await screen.findByRole('button', { name: 'Options for Example' }, { timeout: 5000 })

    await user.click(kebab)
    await user.click(await screen.findByRole('menuitem', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Options for Example' })).not.toBeInTheDocument())
  }, 15_000)
})
