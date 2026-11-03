import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Toggle } from './Toggle'

function Harness() {
  const [isChecked, setIsChecked] = useState(false)
  return (
    <>
      <p id="hint">Look for a newer release at launch.</p>
      <Toggle isChecked={isChecked} onChange={setIsChecked} label="Check for updates" aria-describedby="hint" />
    </>
  )
}

describe('Toggle', () => {
  it('is a named, described switch that flips on click and Space', async () => {
    render(<Harness />)
    const toggle = screen.getByRole('switch', { name: 'Check for updates' })
    expect(toggle).toHaveAccessibleDescription('Look for a newer release at launch.')
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    expect(toggle).toBeChecked()
    await userEvent.keyboard(' ')
    expect(toggle).not.toBeChecked()
  })

  it('ignores input while disabled', async () => {
    const onChange = vi.fn()
    render(<Toggle isChecked={false} onChange={onChange} label="Sounds" isDisabled />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
