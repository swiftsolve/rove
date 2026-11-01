import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { DeviceIcon, RouterIcon, UnknownDeviceIcon, VideoCallIcon, WifiIcon, WifiOffIcon } from '../icons/Icons'
import { IconTile, IconTileButton } from './IconTile'

const SIZES = ['sm', 'md', 'lg'] as const
const TINTS = ['xs', 'sm', 'md', 'inset'] as const

const meta = {
  title: 'Data display/IconTile',
  component: IconTile,
  args: { className: 'text-status-positive', children: <RouterIcon size={16} /> },
  argTypes: {
    size: { control: 'inline-radio', options: SIZES },
    tint: { control: 'inline-radio', options: TINTS },
    children: { control: false },
  },
} satisfies Meta<typeof IconTile>

export default meta
type Story = StoryObj<typeof meta>

/** A wash of the glyph's own colour: a router in the device list. */
export const Default: Story = {}

/** A device list's tile, a shade lighter. */
export const SoftTint: Story = { args: { tint: 'sm', className: 'text-series-down', children: <DeviceIcon size={16} /> } }

/** The faintest wash: an absent connection. */
export const Faint: Story = {
  args: { size: 'lg', tint: 'xs', className: 'text-tertiary', children: <WifiOffIcon size={18} /> },
}

/** Neutral, for something uncategorised. */
export const Inset: Story = { args: { tint: 'inset', className: undefined, children: <UnknownDeviceIcon size={16} /> } }

/** The connection strip's tile. */
export const Large: Story = {
  args: { size: 'lg', tint: 'sm', className: 'text-status-positive', children: <WifiIcon size={18} /> },
}

/** Opens what it stands for: hover deepens the tint and lifts it. */
export const Button: Story = {
  render: () => (
    <IconTileButton className="text-status-good" label="Video calls: Good" onClick={fn()}>
      <VideoCallIcon size={16} />
    </IconTileButton>
  ),
}

/** Inert while a test replaces what it opens. */
export const ButtonDisabled: Story = {
  render: () => (
    <IconTileButton className="text-tertiary" label="Video calls: Testing" onClick={fn()} isDisabled>
      <VideoCallIcon size={16} />
    </IconTileButton>
  ),
}

/** Every size in every tint, then the button form. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      {/* A grid, so each tint's column lines up across sizes. */}
      <div className="grid grid-cols-[repeat(4,max-content)] items-center gap-12">
        {SIZES.map((size) =>
          TINTS.map((tint) => (
            <IconTile
              key={`${size}-${tint}`}
              size={size}
              tint={tint}
              className={tint === 'inset' ? undefined : 'text-series-down'}
            >
              <DeviceIcon size={16} />
            </IconTile>
          )),
        )}
      </div>
      <div className="flex items-center gap-12">
        <IconTileButton className="text-status-positive" label="Video calls: Excellent" onClick={fn()}>
          <VideoCallIcon size={16} />
        </IconTileButton>
        <IconTileButton className="text-tertiary" label="Video calls: Testing" onClick={fn()} isDisabled>
          <VideoCallIcon size={16} />
        </IconTileButton>
      </div>
    </div>
  ),
}
