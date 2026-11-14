import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { Collapsible } from './Collapsible'
import { CollapsiblePanel } from './components/CollapsiblePanel'
import { CollapsibleTrigger } from './components/CollapsibleTrigger'

function Harness() {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <Collapsible isOpen={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger>Connection details</CollapsibleTrigger>
      <CollapsiblePanel>
        <p>Gateway 192.168.1.1</p>
      </CollapsiblePanel>
    </Collapsible>
  )
}

describe('Collapsible', () => {
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

  it('can frame itself, not just the trigger, when the trigger has focus', () => {
    render(
      <Collapsible isOpen={false} onOpenChange={() => {}} hasFocusFrame>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
      </Collapsible>,
    )
    const trigger = screen.getByRole('button', { name: 'Details' })
    expect(trigger).toHaveAttribute('data-collapsible-trigger')
    expect(trigger.parentElement?.className).toContain('has-[[data-collapsible-trigger]:focus-visible]')
  })
})
