import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { HelpIcon, MoreVerticalIcon, PlayIcon, RefreshIcon } from '../icons/Icons'
import { IconButton } from './IconButton'

const meta = {
  title: 'Actions/IconButton',
  component: IconButton,
  args: { label: 'Refresh', icon: RefreshIcon, onClick: fn() },
  argTypes: {
    iconSize: { control: 'inline-radio', options: [16, 14] },
    tooltipSide: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] },
    icon: { control: false },
  },
} satisfies Meta<typeof IconButton>

export default meta
type Story = StoryObj<typeof meta>

/** A neutral inset chip: refresh, help, share, a dialog's close. */
export const Default: Story = {}

/** A glyph that reads large at 16 drops to 14. */
export const SmallGlyph: Story = { args: { label: 'Run', icon: PlayIcon, iconSize: 14 } }

/** The tooltip says more than the label. */
export const WithHint: Story = {
  args: { label: 'Help', icon: HelpIcon, tooltip: 'Latency is the round trip to each service, every minute.' },
}

export const Loading: Story = { args: { isLoading: true } }

/** Still focusable, so its tooltip can say why. */
export const Disabled: Story = { args: { isDisabled: true, tooltip: 'Already checking.' } }

/** Every state. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-12">
      <IconButton label="Refresh" icon={RefreshIcon} />
      <IconButton label="Run" icon={PlayIcon} iconSize={14} />
      <IconButton label="Refresh" icon={RefreshIcon} isLoading />
      <IconButton label="Refresh" icon={RefreshIcon} isDisabled />
      <IconButton label="Options" icon={MoreVerticalIcon} />
    </div>
  ),
}
