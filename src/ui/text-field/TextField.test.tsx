import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TextField, TextFieldAction } from './TextField'
import { Button } from '../button/Button'

function Harness({ onSubmit, onTest }: { onSubmit: () => void; onTest: () => void }): JSX.Element {
  const [address, setAddress] = useState('')
  return (
    <>
      <form
        id="add"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <TextField
          label="Address"
          value={address}
          onChange={setAddress}
          isInvalid={address === 'bad'}
          feedback={address === 'bad' ? 'Not an address.' : 'Tested when you add it.'}
          action={
            <TextFieldAction onClick={onTest} isDisabled={!address} loadingLabel="Testing">
              Test
            </TextFieldAction>
          }
        />
      </form>
      <Button type="submit" form="add" isDisabled={!address}>
        Add
      </Button>
    </>
  )
}

describe('TextField', () => {
  it('is a labelled input described by its feedback', () => {
    render(<Harness onSubmit={vi.fn()} onTest={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: 'Address' })
    expect(input).toHaveAccessibleDescription('Tested when you add it.')
    expect(screen.getByRole('status')).toHaveTextContent('Tested when you add it.')
  })

  it('marks itself invalid', async () => {
    render(<Harness onSubmit={vi.fn()} onTest={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: 'Address' })
    await userEvent.type(input, 'bad')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Not an address.')
  })

  it('submits its form on Enter', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} onTest={vi.fn()} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Address' }), 'example.com{Enter}')
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('keeps its action focusable while disabled, without acting', async () => {
    const onTest = vi.fn()
    render(<Harness onSubmit={vi.fn()} onTest={onTest} />)
    const test = screen.getByRole('button', { name: 'Test' })
    test.focus()
    expect(test).toHaveFocus()
    await userEvent.click(test)
    expect(onTest).not.toHaveBeenCalled()
  })
})
