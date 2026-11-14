import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { iconArg, iconComponentControl } from '../../icons/icon-options'
import { NavItem } from './NavItem'

const meta = {
  title: 'App frame/NavRail/NavItem',
  component: NavItem,
  args: { label: 'Home', icon: iconArg('HomeIcon'), isActive: false, onClick: fn() },
  argTypes: { icon: iconComponentControl },
  // On the rail's surface.
  decorators: [
    (Story) => (
      <div className="inline-flex bg-chrome p-12">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: ['A page in the rail: Home, Devices.', 'An action in the rail’s `footer`: the theme switch.'],
      whenNotToUse: ['An icon action outside the rail: use `IconButton`.'],
      accessibility: {
        builtIn: [
          'A native `<button>` named by `label`, also its tooltip.',
          'The current page’s item has `aria-current="page"`.',
        ],
        toHandle: [
          '`isActive` on the current page’s item, and only that one.',
          'An action’s `label` says what it does: “Switch to light mode”.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof NavItem>

export default meta
type Story = StoryObj<typeof meta>

/** A page that isn't open. Hover for its tooltip. */
export const Default: Story = {}

/** The current page: tinted, with the accent bar. */
export const Active: Story = { args: { isActive: true } }

/** A click runs it, and so does Enter once it has focus; the current page's item says so. */
export const Activating: Story = {
  tags: ['!autodocs'],
  args: { isActive: true },
  play: async ({ args, canvas, userEvent }) => {
    const item = canvas.getByRole('button', { name: 'Home' })
    await expect(item).toHaveAttribute('aria-current', 'page')
    await userEvent.click(item)
    await expect(args.onClick).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Enter}')
    await expect(args.onClick).toHaveBeenCalledTimes(2)
  },
}
