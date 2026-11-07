import type { Meta, StoryObj } from '@storybook/react-vite'

import { BrandIcon } from './BrandIcon'
import { CloudGamingIcon } from './CloudGamingIcon'
import { ConnectionIcon } from './ConnectionIcon'
import { DirectionIcon } from './DirectionIcon'
import { HdStreamIcon } from './HdStreamIcon'
import type { IconProps } from './Icons'
import * as Icons from './Icons'
import { PathIcon } from './PathIcon'
import { UltraHdStreamIcon } from './UltraHdStreamIcon'

const CUSTOM = {
  BrandIcon,
  CloudGamingIcon,
  ConnectionIcon,
  // DirectionIcon takes a series, so the list shows both.
  'DirectionIcon down': (props: IconProps) => <DirectionIcon series="down" {...props} />,
  'DirectionIcon up': (props: IconProps) => <DirectionIcon series="up" {...props} />,
  HdStreamIcon,
  PathIcon,
  UltraHdStreamIcon,
}
// Every Lucide alias and custom icon, by name (the module's types are gone at
// runtime, so only icons are left).
const ICONS = Object.entries({ ...Icons, ...CUSTOM })
  .filter((entry): entry is [string, Icons.IconComponent] => typeof entry[1] === 'function')
  .sort(([a], [b]) => a.localeCompare(b))

const meta = {
  title: 'Icons/All icons',
  argTypes: {
    size: {
      control: { type: 'range', min: 12, max: 32, step: 1 },
      description: 'Unset: each icon at its own default size.',
    },
    className: {
      control: false,
      description: "Its colour (`text-positive`) and place in a line. It's the text colour by default.",
    },
  },
} satisfies Meta<IconProps>

export default meta
// No `component` to take the args from: the stories take an icon's props.
type Story = StoryObj<IconProps>

/** Every icon, named. Set `size` to see them all at one size. */
export const Catalogue: Story = {
  // Centred, the list shrinks to one column; padded, it fills the width.
  parameters: { layout: 'padded' },
  render: ({ size }) => (
    <ul role="list" className="grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-8">
      {ICONS.map(([name, Icon]) => (
        <li key={name} className="flex flex-col items-center gap-8 rounded-sm bg-surface px-8 py-12 text-secondary">
          <span className="flex h-[32px] items-center">
            <Icon size={size} />
          </span>
          <span className="type-caption text-tertiary">{name}</span>
        </li>
      ))}
    </ul>
  ),
}

/** The Rove mark in the accent colour, and with the app icon's gradient. */
export const Brand: Story = {
  render: ({ size = 48 }) => (
    <div className="flex items-center gap-20 text-accent">
      <BrandIcon size={size} />
      <BrandIcon size={size} hasGradient />
    </div>
  ),
}
