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
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A few secondary actions on a row or a page header: Edit, Remove.',
        'Keeping a destructive action out of the way, like Speed history’s Delete.',
        '`tone="negative"` on an item that deletes or clears.',
      ],
      avoid: [
        'The page’s main action: use `Button`.',
        'One frequent action: use `IconButton`.',
        'Picking one of a few options: use `SegmentedControl`.',
        'Opening another view: use `Link`.',
      ],
      states: [
        'Closed, the kebab tints on hover. Open, it keeps the tint.',
        'An item highlights on hover and on the arrow keys alike.',
        'A negative item is red, with a red tint when highlighted.',
        'It keeps its own open state, or takes `isOpen` and `onOpenChange`.',
      ],
      accessibility: {
        builtIn: [
          'The kebab is a menu button: screen readers hear it opens a menu, and whether it’s open.',
          'Enter opens it on its first item. The arrow keys move between items.',
          'Escape, a click outside or an item closes it, and focus returns to the kebab.',
          'Not modal: a click outside still lands where it was aimed.',
          'The highlight is the items’ focus indicator. Their icons are hidden from screen readers.',
        ],
        yours: [
          'A kebab `label` that names what it’s for: “Options for Google”.',
          'Short item labels that say what happens: Edit, Remove.',
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
