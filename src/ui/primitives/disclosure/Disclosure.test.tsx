import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Disclosure, DisclosurePanel, DisclosureTrigger } from './Disclosure'

function Harness(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <Disclosure isOpen={isOpen} onOpenChange={setIsOpen}>
      <DisclosureTrigger>Connection details</DisclosureTrigger>
      <DisclosurePanel>
        <p>Gateway 192.168.1.1</p>
      </DisclosurePanel>
    </Disclosure>
  )
}

describe('Disclosure', () => {
  it('shows and hides its panel, saying so on the trigger', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Connection details' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Gateway 192.168.1.1')).not.toBeInTheDocument()

    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByText('Gateway 192.168.1.1').parentElement
    expect(trigger).toHaveAttribute('aria-controls', panel?.id)

    await userEvent.keyboard('{Enter}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
