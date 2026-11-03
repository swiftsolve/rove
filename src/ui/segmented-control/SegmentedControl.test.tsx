import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { SegmentedControl } from './SegmentedControl'

type Mode = 'dark' | 'light' | 'system'
const OPTIONS: { value: Mode; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
]

function Harness() {
  const [mode, setMode] = useState<Mode>('dark')
  return (
    <>
      <span id="label">Theme</span>
      <SegmentedControl options={OPTIONS} value={mode} onChange={setMode} aria-labelledby="label" />
    </>
  )
}

describe('SegmentedControl', () => {
  it('is a named radio group with the value checked', () => {
    render(<Harness />)
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
  })

  it('chooses on click, and with the arrow keys from its one Tab stop', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'System' })).toHaveFocus()
  })
})
