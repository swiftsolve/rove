import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Banner } from './Banner'

describe('Banner', () => {
  it('stays dismissed while its title is the same, and shows again once a new one has come and gone', async () => {
    const { rerender } = render(<Banner variant="error" title="A" description="Line" />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    rerender(<Banner variant="error" title="B" description="Line" />)
    expect(screen.getByRole('alert')).toHaveTextContent('B')
    rerender(<Banner variant="error" title="A" description="Line" />)
    expect(screen.getByRole('alert')).toHaveTextContent('A')
  })

  it('settles Retry when the retry fails, without an unhandled rejection', async () => {
    const onRetry = () => Promise.reject(new Error('still down'))
    render(<Banner variant="error" title="A" description="Line" onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Retry' })).not.toHaveAttribute('data-loading')
  })
})
