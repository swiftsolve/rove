import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppErrorBoundary } from './AppErrorBoundary'

function Crash(): never {
  throw new Error('boom')
}

describe('AppErrorBoundary', () => {
  it('replaces a crashed screen with a notice and Reload, and logs the error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <AppErrorBoundary>
        <Crash />
      </AppErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('This screen couldn’t load.')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith('Render crashed:', expect.any(Error), expect.anything())
    consoleError.mockRestore()
  })
})
