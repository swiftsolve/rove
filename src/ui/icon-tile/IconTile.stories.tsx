import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import * as Icons from '../icons/Icons'
import { DeviceIcon, UnknownDeviceIcon, VideoCallIcon, WifiIcon, WifiOffIcon } from '../icons/Icons'
import { IconTile, IconTileButton } from './IconTile'

const SIZES = ['sm', 'md', 'lg'] as const
// The colours the app's tiles use. The tile takes any CSS colour.
const COLORS = [
  'var(--status-positive)',
  'var(--status-good)',
  'var(--status-warning)',
  'var(--status-poor)',
  'var(--status-negative)',
  'var(--series-down)',
  'var(--series-up)',
  'neutral',
]

// Every icon the library exports (the types are gone at runtime), by name, for
// the icon control, as Figma's Icon swap offers.
const ICONS = Object.fromEntries(
  Object.entries(Icons)
    .filter((entry): entry is [string, Icons.IconComponent] => typeof entry[1] === 'function')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, Icon]) => [name, <Icon key={name} size={16} />]),
)

const meta = {
  title: 'Data display/IconTile',
  component: IconTile,
  args: { color: 'var(--status-positive)', icon: 'RouterIcon' },
  argTypes: {
    size: { control: 'inline-radio', options: SIZES },
    color: { control: 'text' },
    icon: { control: 'select', options: Object.keys(ICONS), mapping: ICONS },
  },
  parameters: {
    docs: { subtitle: 'A tinted square holding an item’s icon, in the item’s colour.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'The icon that starts an item’s row: a device, a capability.',
        'A tile that opens something on its own, as `IconTileButton`: Home’s capability strip.',
      ],
      whenNotToUse: [
        'An icon-only action: use `IconButton`.',
        'A whole row that opens something: use `ListRow`, the tile inside.',
        'An event on a timeline: use `TimelineNode`.',
      ],
      accessibility: {
        handledByComponent: [
          'The plain tile is a `<span>`; library icons in it are `aria-hidden`.',
          '`IconTileButton` is a native `<button>` named by `label`.',
          'Disabled, the button stays focusable and says so, but ignores presses.',
        ],
        handledByYourCode: [
          'Words beside a plain tile that say what the item is.',
          'A button `label` with the item and its state: “Video calls: Good”.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof IconTile>

export default meta
type Story = StoryObj<typeof meta>

/** A wash of the icon's own colour: a router in the device list. */
export const Default: Story = {}

/** An absent connection: the same wash, in the negative colour. */
export const Disconnected: Story = {
  args: { size: 'lg', color: 'var(--status-negative)', icon: <WifiOffIcon size={18} /> },
}

/** The sunken background, for something uncategorised or not yet rated. */
export const Neutral: Story = { args: { color: 'neutral', icon: <UnknownDeviceIcon size={16} /> } }

/** The connection strip's tile. */
export const Large: Story = {
  args: { size: 'lg', color: 'var(--series-down)', icon: <WifiIcon size={18} /> },
}

/** Opens what it stands for: hover and keyboard focus deepen the tint and lift it, a touch larger. */
export const Button: Story = {
  render: () => (
    <IconTileButton
      color="var(--status-good)"
      label="Video calls: Good"
      onClick={fn()}
      icon={<VideoCallIcon size={16} />}
    />
  ),
}

/** Inert while a test replaces what it opens. */
export const ButtonDisabled: Story = {
  render: () => (
    <IconTileButton
      color="neutral"
      label="Video calls: Testing"
      onClick={fn()}
      isDisabled
      icon={<VideoCallIcon size={16} />}
    />
  ),
}

const onOpenTile = fn()

/** The button form opens on a click, and on Enter once it has focus. */
export const ButtonOpening: Story = {
  tags: ['!autodocs'],
  render: () => (
    <IconTileButton
      color="var(--status-good)"
      label="Video calls: Good"
      onClick={onOpenTile}
      icon={<VideoCallIcon size={16} />}
    />
  ),
  play: async ({ canvas, userEvent }) => {
    const tile = canvas.getByRole('button', { name: 'Video calls: Good' })
    await userEvent.click(tile)
    await expect(onOpenTile).toHaveBeenCalledOnce()
    await userEvent.keyboard('{Enter}')
    await expect(onOpenTile).toHaveBeenCalledTimes(2)
  },
}

/** Disabled, it stays in the Tab order, announced as disabled, but Enter or a click does nothing. */
export const ButtonDisabledStaysInert: Story = {
  tags: ['!autodocs'],
  render: () => (
    <IconTileButton
      color="neutral"
      label="Video calls: Testing"
      onClick={onOpenTile}
      isDisabled
      icon={<VideoCallIcon size={16} />}
    />
  ),
  play: async ({ canvas, userEvent }) => {
    const tile = canvas.getByRole('button', { name: 'Video calls: Testing' })
    await userEvent.keyboard('{Tab}')
    await expect(tile).toHaveFocus()
    await expect(tile).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Enter}')
    await userEvent.click(tile)
    await expect(onOpenTile).not.toHaveBeenCalled()
  },
}

/** Every size in each colour the app uses, then the button form. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      {/* A grid, so each colour's column lines up across sizes. */}
      <div className="grid grid-cols-[repeat(8,max-content)] items-center gap-12">
        {SIZES.map((size) =>
          COLORS.map((color) => (
            <IconTile key={`${size}-${color}`} size={size} color={color} icon={<DeviceIcon size={16} />} />
          )),
        )}
      </div>
      <div className="flex items-center gap-12">
        <IconTileButton
          color="var(--status-positive)"
          label="Video calls: Excellent"
          onClick={fn()}
          icon={<VideoCallIcon size={16} />}
        />
        <IconTileButton
          color="neutral"
          label="Video calls: Testing"
          onClick={fn()}
          isDisabled
          icon={<VideoCallIcon size={16} />}
        />
      </div>
    </div>
  ),
}
