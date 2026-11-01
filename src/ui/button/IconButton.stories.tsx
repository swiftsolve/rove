import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { HelpIcon, MoreVerticalIcon, PlayIcon, RefreshIcon } from '../icons/Icons'
import { IconButton } from './IconButton'

const meta = {
  title: 'Actions/IconButton',
  component: IconButton,
  args: { label: 'Refresh', icon: RefreshIcon, onClick: fn() },
  argTypes: {
    variant: { control: 'inline-radio', options: ['soft', 'ghost'] },
    iconSize: { control: 'inline-radio', options: [16, 14] },
    tooltipSide: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] },
    icon: { control: false },
  },
} satisfies Meta<typeof IconButton>

export default meta
type Story = StoryObj<typeof meta>

/** A neutral inset chip: refresh, help, share. */
export const Soft: Story = { args: { variant: 'soft' } }

/** No fill until hovered: a dialog's close. */
export const Ghost: Story = { args: { variant: 'ghost' } }

/** A glyph that reads large at 16 drops to 14. */
export const SmallGlyph: Story = { args: { label: 'Run', icon: PlayIcon, iconSize: 14 } }

/** The tooltip says more than the label. */
export const WithHint: Story = {
  args: { label: 'Help', icon: HelpIcon, tooltip: 'Latency is the round trip to each service, every minute.' },
}

export const Loading: Story = { args: { isLoading: true } }

/** Still focusable, so its tooltip can say why. */
export const Disabled: Story = { args: { isDisabled: true, tooltip: 'Already checking.' } }

/** Every variant in every state. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      {(['soft', 'ghost'] as const).map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-12">
          <IconButton variant={variant} label="Refresh" icon={RefreshIcon} />
          <IconButton variant={variant} label="Run" icon={PlayIcon} iconSize={14} />
          <IconButton variant={variant} label="Refresh" icon={RefreshIcon} isLoading />
          <IconButton variant={variant} label="Refresh" icon={RefreshIcon} isDisabled />
          <IconButton variant={variant} label="Options" icon={MoreVerticalIcon} />
        </div>
      ))}
    </div>
  ),
}
