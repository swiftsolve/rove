import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '../button/Button'
import { DialogRoot } from './context/DialogRoot'
import { Dialog } from './Dialog'

/** Opens the dialog from a button, as the app does, and counts closes. */
function Harness({ canClose, isDirty }: { canClose?: boolean; isDirty?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open</Button>
      <DialogRoot isOpen={isOpen}>
        <Dialog
          title="Add a service"
          description="Track a service by URL."
          cancelLabel="Cancel"
          canClose={canClose}
          isDirty={isDirty}
          onClose={() => setIsOpen(false)}
          actions={<Button variant="solid">Add</Button>}
        >
          {/* As in the app's add dialog: the field takes focus, not the close
              button (whose tooltip would take the first Escape). */}
          {/* eslint-disable-next-line jsx-a11y-x/no-autofocus -- as in the app's add dialog. */}
          <input aria-label="Address" autoFocus />
        </Dialog>
      </DialogRoot>
    </>
  )
}

async function open(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: 'Open' }))
  return screen.findByRole('dialog', { name: 'Add a service' })
}

describe('Dialog', () => {
  it('is a named, described modal that takes focus', async () => {
    render(<Harness />)
    const dialog = await open()
    expect(dialog).toHaveAccessibleDescription('Track a service by URL.')
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Address' })).toHaveFocus())
    expect(dialog).toBeInTheDocument()
  })

  it('takes focus on its panel when no field does, not on its close button', async () => {
    render(
      <DialogRoot isOpen>
        <Dialog title="Clear history?" cancelLabel="Cancel" onClose={() => {}} />
      </DialogRoot>,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Clear history?' })
    await waitFor(() => expect(dialog).toHaveFocus())
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('closes on Escape, gives focus back to its opener, and unmounts', async () => {
    render(<Harness />)
    await open()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })

  it('closes on Cancel and on its close button', async () => {
    const { unmount } = render(<Harness />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    unmount()

    render(<Harness />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('stays open while it can’t close', async () => {
    render(<Harness canClose={false} />)
    await open()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('keeps typed input from a stray backdrop click, but not from Escape', async () => {
    render(<Harness isDirty />)
    await open()
    await userEvent.click(document.body)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes on a backdrop click when nothing was typed', async () => {
    const onClose = vi.fn()
    render(
      <DialogRoot isOpen>
        <Dialog title="Share" onClose={onClose} />
      </DialogRoot>,
    )
    await screen.findByRole('dialog')
    await userEvent.click(document.body)
    expect(onClose).toHaveBeenCalled()
  })
})
