import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ComponentProps, useState } from 'react'
import { expect, fn, screen, waitFor, within } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { EditIcon, TrashIcon } from '../icons/Icons'
import { MenuContent } from './components/MenuContent'
import { MenuItem } from './components/MenuItem'
import { MenuTrigger } from './components/MenuTrigger'
import { Menu } from './Menu'

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
    partGuidance: {
      MenuTrigger: {
        whenToUse: ['The kebab that opens a row’s or card’s menu.'],
        whenNotToUse: ['One action on its own: use `IconButton`.'],
        accessibility: {
          builtIn: ['A button that says whether its menu is open.', 'Enter or Space opens the menu on its first item.'],
          toHandle: ['A `label` that names its subject: “Options for Google”.'],
        },
      },
      MenuContent: {
        whenToUse: ['The list the kebab opens, holding its `MenuItem`s.'],
        whenNotToUse: ['A list that stays on the page: use `CardList`.'],
        accessibility: {
          builtIn: ['A `menu`, lined up under the kebab’s right edge.', 'It takes focus when it opens.'],
          toHandle: ['Only `MenuItem`s, the most used first.'],
        },
      },
      MenuItem: {
        whenToUse: ['One action in the menu: Edit, Remove.', 'A destructive action, `tone="negative"`: Clear history.'],
        whenNotToUse: ['A setting that stays on or off: use `Toggle`.'],
        accessibility: {
          builtIn: [
            'A `menuitem`: Enter or a click runs it and closes the menu.',
            'Its icon is hidden from screen readers.',
          ],
          toHandle: ['A label that says what happens: “Remove”, not “OK”.'],
        },
      },
    } satisfies Record<string, Guidance>,
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

function OpenMenu({ onOpenChange, ...args }: ComponentProps<typeof Menu>) {
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
