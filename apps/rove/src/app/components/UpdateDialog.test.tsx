import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { PendingUpdate } from '@/app/utils/updater'

import { UpdateDialog } from './UpdateDialog'

function renderDialog(install: () => Promise<void>) {
  const update: PendingUpdate = { version: '0.0.4', currentVersion: '0.0.3', notes: '', install }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UpdateDialog update={update} onDismiss={vi.fn()} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('UpdateDialog', () => {
  it('says it is installing, and stays open, while the install runs', async () => {
    const user = renderDialog(() => new Promise(() => {}))
    await user.click(screen.getByRole('button', { name: 'Install and restart' }))
    expect(screen.getByRole('button', { name: 'Installing…' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Installing the update. Rove will restart when it’s done.')).toBeInTheDocument()
  })

  it('offers to try again when the install fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const user = renderDialog(() => Promise.reject(new Error('signature mismatch')))
    await user.click(screen.getByRole('button', { name: 'Install and restart' }))
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
