import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, screen, waitFor, within } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { EditIcon, TrashIcon } from '../icons/Icons'
import { Menu, MenuContent, MenuItem, MenuTrigger } from './Menu'

const onEdit = fn()
const onRemove = fn()

const meta = {
  title: 'Actions/Menu',
  component: Menu,
  args: {
    onOpenChange: fn(),
    children: (
      <>
        <MenuTrigger label="Options for Google" />
        <MenuContent>
          <MenuItem icon={EditIcon} onClick={onEdit}>
            Edit
          </MenuItem>
          <MenuItem icon={TrashIcon} tone="negative" onClick={onRemove}>
            Remove
          </MenuItem>
        </MenuContent>
      </>
    ),
  },
  argTypes: {
    isOpen: { control: false },
    children: { control: false },
  },
  parameters: {
    docs: { subtitle: 'A short list of actions behind a kebab button.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'A few secondary actions on a row, like a service’s Edit and Remove.',
        'A destructive action kept out of the way, its item `tone="negative"`: Clear history.',
      ],
      whenNotToUse: ['The page’s main action: use `Button`.', 'One frequent action: use `IconButton`.'],
      accessibility: {
        builtIn: [
          'The kebab is a menu button that says whether it’s open.',
          'Enter opens it on its first item, and the arrows move between items.',
          'Escape, a click outside or an item closes it, and focus returns.',
        ],
        toHandle: [
          'A kebab `label` that names its subject: “Options for Google”.',
          'Item labels that say what happens: Edit, Remove.',
        ],
      },
    } satisfies Guidance,
  },
  // The menu lines up with the kebab's right edge, so it needs room to its
  // left, and room below to open into.
  decorators: [
    (Story) => (
      <div className="flex h-[120px] w-[200px] items-start justify-end">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Menu>

export default meta
type Story = StoryObj<typeof meta>

/** Click the kebab to open it. */
export const Closed: Story = {}

/** Open from the start; Escape, a click outside or an item closes it. */
export const Open: Story = {
  render: (args) => <OpenMenu {...args} />,
}

/** A single destructive action, as on Speed history. */
export const SingleAction: Story = {
  args: {
    children: (
      <>
        <MenuTrigger label="History options" />
        <MenuContent>
          <MenuItem icon={TrashIcon} tone="negative" onClick={onRemove}>
            Delete
          </MenuItem>
        </MenuContent>
      </>
    ),
  },
}

/** From the keyboard: Enter opens it on its first item, and the arrows move between items. */
export const Keyboard: Story = {
  // Moves focus, which would scroll the docs page to it.
  tags: ['!autodocs'],
  play: async ({ canvas, userEvent }) => {
    await userEvent.keyboard('{Tab}')
    await expect(canvas.getByRole('button', { name: 'Options for Google' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    const menu = await screen.findByRole('menu')
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'Edit' })).toHaveFocus())
    await userEvent.keyboard('{ArrowDown}')
    await expect(within(menu).getByRole('menuitem', { name: 'Remove' })).toHaveFocus()
  },
}

/** Choosing an item runs it, closes the menu and puts focus back on the kebab. */
export const ChoosingAnItem: Story = {
  tags: ['!autodocs'],
  play: async ({ canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'Options for Google' })
    await userEvent.click(trigger)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))
    await expect(onEdit).toHaveBeenCalledOnce()
    await expect(onRemove).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await expect(trigger).toHaveFocus()
  },
}

function OpenMenu({ onOpenChange, ...args }: Parameters<typeof Menu>[0]) {
  const [isOpen, setIsOpen] = useState(true)
  return (
    <Menu
      {...args}
      isOpen={isOpen}
      onOpenChange={(isNowOpen) => {
        setIsOpen(isNowOpen)
        onOpenChange?.(isNowOpen)
      }}
    />
  )
}
