import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('shows its content on hover, and hides it on a click', async () => {
    render(
      <Tooltip content="Refresh the list">
        <button type="button">Refresh</button>
      </Tooltip>,
    )
    const trigger = screen.getByRole('button', { name: 'Refresh' })
    await userEvent.hover(trigger)
    expect(await screen.findByText('Refresh the list', { selector: '[data-open]' })).toBeVisible()
    await userEvent.click(trigger)
    expect(screen.queryByText('Refresh the list', { selector: '[data-open]' })).not.toBeInTheDocument()
  })

  it('describes its trigger to a screen reader', () => {
    render(
      <Tooltip content="Latency is a full HTTPS handshake.">
        <button type="button" aria-label="About service checks" />
      </Tooltip>,
    )
    expect(screen.getByRole('button')).toHaveAccessibleDescription('Latency is a full HTTPS handshake.')
  })

  it('keeps a description the trigger already had', () => {
    render(
      <>
        <p id="hint">Checks GitHub.</p>
        <Tooltip content="Last checked today">
          <button type="button" aria-describedby="hint">
            Check
          </button>
        </Tooltip>
      </>,
    )
    expect(screen.getByRole('button')).toHaveAccessibleDescription('Checks GitHub. Last checked today')
  })

  it("doesn't repeat the trigger's name as its description", () => {
    render(
      <Tooltip content="Refresh">
        <button type="button" aria-label="Refresh" />
      </Tooltip>,
    )
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-describedby')
  })

  it('never opens or describes while disabled', async () => {
    render(
      <Tooltip content="Excellent" isDisabled>
        <button type="button">Streaming</button>
      </Tooltip>,
    )
    const trigger = screen.getByRole('button')
    expect(trigger).not.toHaveAttribute('aria-describedby')
    await userEvent.hover(trigger)
    expect(screen.queryByText('Excellent')).not.toBeInTheDocument()
  })
})
