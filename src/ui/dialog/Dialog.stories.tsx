import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ComponentProps, useState } from 'react'
import { expect, fn, waitFor } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { Button } from '../button/Button'
import { PortalProvider } from '../context/PortalProvider'
import { PlusIcon } from '../icons/Icons'
import { TextField } from '../text-field/TextField'
import { Dialog, DialogRoot } from './Dialog'

const meta = {
  title: 'Overlays/Dialog',
  component: Dialog,
  args: {
    title: 'Add a service',
    description: 'Track a service by URL or IP address.',
    children: <p className="text-sm text-secondary">Rove checks it every minute.</p>,
    cancelLabel: 'Cancel',
    actions: <Button variant="solid">Add</Button>,
    onClose: fn(),
  },
  argTypes: {
    children: { control: false },
    actions: { control: false },
  },
  render: (args) => <DialogFrame {...args} />,
  parameters: {
    // The frame stands in for the content column: it takes the canvas's width,
    // and its contents are all absolute, so centred it would collapse to nothing.
    layout: 'padded',
    // An open dialog makes the page behind it inert, so on the docs page each
    // story gets a frame of its own.
    docs: { story: { inline: false, iframeHeight: 340 }, toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A short task before going on: Add a service.',
        'One thing up close: the Share Wi‑Fi QR code.',
        'A prompt the user can put off: Update available.',
      ],
      avoid: [
        'A hint on hover or focus: use `Tooltip`.',
        'A failure on the page: use `Banner`.',
        'A few actions on one item: use `Menu`.',
      ],
      accessibility: {
        builtIn: [
          'A modal `dialog`, named by its title and described by `description`.',
          'Focus stays inside; the page behind is hidden from screen readers.',
          'Escape closes it, and focus returns to the control that opened it.',
        ],
        toHandle: [
          '`autoFocus` on a form’s first field, as Add a service does.',
          'A live region (`aria-live`) around a body that changes while open, as Share Wi‑Fi does.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

/** Title, description, a recessed body, and Cancel beside the main action. */
export const Open: Story = {}

/** Only a header and actions: a confirmation. */
export const Confirmation: Story = {
  args: {
    title: 'Clear history?',
    description: 'Every speed test result is deleted.',
    children: undefined,
    actions: (
      <Button variant="solid" tone="negative">
        Clear
      </Button>
    ),
  },
}

/** While something runs that closing would abandon, every way out is off. */
export const Busy: Story = {
  args: {
    canClose: false,
    actions: (
      <Button variant="solid" isLoading loadingLabel="Adding…">
        Add
      </Button>
    ),
  },
}

/** A button opens it; Escape, Close, Cancel, Add or the backdrop closes it, and focus goes back to the button. */
export const WithTrigger: Story = {
  render: (args) => <DialogWithTrigger {...args} />,
}

/** Opening puts focus on the field; Escape closes it and gives focus back to the button. */
export const EscapeCloses: Story = {
  tags: ['!autodocs'],
  // As in the app's add dialog, the field takes focus. On the close button,
  // the first Escape would close its tooltip instead.
  // eslint-disable-next-line jsx-a11y-x/no-autofocus -- as in the app's add dialog.
  args: { children: <TextField label="Address" value="" onChange={() => {}} autoFocus /> },
  render: (args) => <DialogWithTrigger {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Add service' })
    await userEvent.click(trigger)
    await waitFor(() => expect(canvas.getByRole('textbox', { name: 'Address' })).toHaveFocus())
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(canvas.queryByRole('dialog')).not.toBeInTheDocument())
    await expect(args.onClose).toHaveBeenCalledOnce()
    await expect(trigger).toHaveFocus()
  },
}

type DialogProps = ComponentProps<typeof Dialog>

// A box of its own, the way the app opens a dialog over its content column.
const FRAME = 'relative h-[300px] overflow-hidden rounded-lg'

/** The dialog open in its frame. */
function DialogFrame(args: DialogProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return (
    <div ref={setContainer} className={FRAME}>
      <PortalProvider container={container}>
        {container && (
          <DialogRoot isOpen>
            <Dialog {...args} />
          </DialogRoot>
        )}
      </PortalProvider>
    </div>
  )
}

function DialogWithTrigger({ onClose, ...args }: DialogProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const close = (): void => {
    setIsOpen(false)
    onClose()
  }
  return (
    <div ref={setContainer} className={`${FRAME} flex items-center justify-center`}>
      <Button variant="solid" icon={PlusIcon} onClick={() => setIsOpen(true)}>
        Add service
      </Button>
      <PortalProvider container={container}>
        <DialogRoot isOpen={isOpen}>
          <Dialog
            {...args}
            onClose={close}
            actions={
              <Button variant="solid" onClick={close}>
                Add
              </Button>
            }
          />
        </DialogRoot>
      </PortalProvider>
    </div>
  )
}
