import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { iconArg, iconComponentControl } from '../icons/icon-options'
import { NavItem } from './NavRail'

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
} satisfies Meta<typeof NavItem>

export default meta
type Story = StoryObj<typeof meta>

/** A page that isn't open. Hover for its tooltip. */
export const Default: Story = {}

/** The current page: tinted, with the accent bar. */
export const Active: Story = { args: { isActive: true } }
