import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ComponentProps, type ReactNode, useState } from 'react'
import { expect, fn, waitFor } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../.storybook/docs-page'
import { Button } from '../button/Button'
import { PortalProvider } from '../context/PortalProvider'
import { PlusIcon } from '../icons/Icons'
import { TextField } from '../text-field/TextField'
import { DialogRoot } from './context/DialogRoot'
import { Dialog } from './Dialog'

const meta = {
  title: 'Overlays/Dialog',
  component: Dialog,
  args: {
    title: 'Add a service',
    description: 'Track a service by URL or IP address.',
    children: <ServiceFields />,
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
    docs: {
      subtitle: 'A window over the page: a title, a body, and actions at the foot.',
      story: { inline: false, iframeHeight: 460 },
      toc: GUIDANCE_TOC,
    },
    guidance: {
      whenToUse: [
        'A short task before going on: Add a service.',
        'One thing up close: the Share Wi‑Fi QR code.',
        'A prompt the user can put off: Update available.',
      ],
      whenNotToUse: [
        'A hint on hover or focus: use `Tooltip`.',
        'A failure on the page: use `Banner`.',
        'A few actions on one item: use `Menu`.',
      ],
      accessibility: {
        builtIn: [
          'A modal `dialog`, named by its title and described by `description`.',
          'Focus moves in, onto the panel when no field takes it, and stays inside; the page behind is hidden from screen readers.',
          'Escape closes it, and focus returns to the control that opened it.',
        ],
        toHandle: [
          '`autoFocus` on a form’s first field, as Add a service does.',
          'A live region (`aria-live`) around a body that changes while open, as Share Wi‑Fi does.',
        ],
      },
    } satisfies Guidance,
    partGuidance: {
      DialogRoot: {
        whenToUse: ['Around every `Dialog`, opening it with `isOpen`.'],
        whenNotToUse: ['More detail on the page itself: use `Collapsible`.'],
        accessibility: {
          builtIn: ['Draws nothing: the `Dialog` inside carries its role and focus.'],
          toHandle: ['`isOpen` turned false from the Dialog’s `onClose`, so Escape closes it.'],
        },
      },
    } satisfies Record<string, Guidance>,
  },
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

/** Title, description, a recessed body of fields, and Cancel beside the main action. The first field takes focus. */
export const Open: Story = {}

/** Only a header and actions: a confirmation. With no field, the panel takes focus, and Tab goes on to its buttons. */
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

/** Add a service's fields, as in the app: the address takes focus. */
function ServiceFields(): ReactNode {
  const [address, setAddress] = useState('')
  const [name, setName] = useState('')
  return (
    <>
      <TextField
        label="Address"
        value={address}
        onChange={setAddress}
        placeholder="example.com or 192.168.1.1"
        feedback="Tested when you add it."
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- a dialog's first field takes focus, as in the app's add dialog.
        autoFocus
      />
      <TextField
        className="mt-16"
        label="Name"
        value={name}
        onChange={setName}
        placeholder="Auto-detected from the address"
      />
    </>
  )
}

/** A box of its own, the way the app opens a dialog over its content column. */
const FRAME = 'relative h-[420px] overflow-hidden rounded-lg'

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
