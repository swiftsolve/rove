import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { DeviceIcon, RouterIcon, UnknownDeviceIcon, VideoCallIcon, WifiIcon, WifiOffIcon } from '../icons/Icons'
import { IconTile, IconTileButton } from './IconTile'

const SIZES = ['sm', 'md', 'lg'] as const
const COLORS = ['positive', 'good', 'warning', 'poor', 'negative', 'download', 'upload', 'neutral'] as const

const meta = {
  title: 'Data display/IconTile',
  component: IconTile,
  args: { color: 'positive', children: <RouterIcon size={16} /> },
  argTypes: {
    size: { control: 'inline-radio', options: SIZES },
    color: { control: 'select', options: COLORS },
    children: { control: false },
  },
} satisfies Meta<typeof IconTile>

export default meta
type Story = StoryObj<typeof meta>

/** A wash of the icon's own colour: a router in the device list. */
export const Default: Story = {}

/** An absent connection: the same wash, in the negative colour. */
export const Disconnected: Story = {
  args: { size: 'lg', color: 'negative', children: <WifiOffIcon size={18} /> },
}

/** The sunken fill, for something uncategorised or not yet rated. */
export const Neutral: Story = { args: { color: 'neutral', children: <UnknownDeviceIcon size={16} /> } }

/** The connection strip's tile. */
export const Large: Story = {
  args: { size: 'lg', color: 'download', children: <WifiIcon size={18} /> },
}

/** Opens what it stands for: hover deepens the tint and lifts it. */
export const Button: Story = {
  render: () => (
    <IconTileButton color="good" label="Video calls: Good" onClick={fn()}>
      <VideoCallIcon size={16} />
    </IconTileButton>
  ),
}

/** Inert while a test replaces what it opens. */
export const ButtonDisabled: Story = {
  render: () => (
    <IconTileButton color="neutral" label="Video calls: Testing" onClick={fn()} isDisabled>
      <VideoCallIcon size={16} />
    </IconTileButton>
  ),
}

/** Every size in every colour, then the button form. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      {/* A grid, so each colour's column lines up across sizes. */}
      <div className="grid grid-cols-[repeat(8,max-content)] items-center gap-12">
        {SIZES.map((size) =>
          COLORS.map((color) => (
            <IconTile key={`${size}-${color}`} size={size} color={color}>
              <DeviceIcon size={16} />
            </IconTile>
          )),
        )}
      </div>
      <div className="flex items-center gap-12">
        <IconTileButton color="positive" label="Video calls: Excellent" onClick={fn()}>
          <VideoCallIcon size={16} />
        </IconTileButton>
        <IconTileButton color="neutral" label="Video calls: Testing" onClick={fn()} isDisabled>
          <VideoCallIcon size={16} />
        </IconTileButton>
      </div>
    </div>
  ),
}
