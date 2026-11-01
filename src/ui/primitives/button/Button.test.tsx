import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { PlayIcon } from '../../icons/Icons'

describe('Button', () => {
  it('is a plain button, not a submit, unless told otherwise', () => {
    render(<Button>Run</Button>)
    expect(screen.getByRole('button', { name: 'Run' })).toHaveAttribute('type', 'button')
  })

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Run</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('stays focusable while disabled, but drops clicks and keys', async () => {
    const onClick = vi.fn()
    render(
      <Button isDisabled onClick={onClick}>
        Run
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Run' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    await userEvent.tab()
    expect(button).toHaveFocus()
    await userEvent.keyboard('{Enter}{ }')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('is busy while loading, drops clicks and keeps its name', async () => {
    const onClick = vi.fn()
    render(
      <Button icon={PlayIcon} isLoading onClick={onClick}>
        Run
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Run' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('passes extra props and a ref to the <button>', () => {
    const ref = { current: null as HTMLButtonElement | null }
    render(
      <Button ref={ref} aria-haspopup="dialog" data-testid="add">
        Add
      </Button>,
    )
    expect(ref.current).toBe(screen.getByTestId('add'))
    expect(ref.current).toHaveAttribute('aria-haspopup', 'dialog')
  })
})
