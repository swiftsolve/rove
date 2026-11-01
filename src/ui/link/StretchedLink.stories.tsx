import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Card } from '../card/Card'
import { ChevronRightIcon, MoreVerticalIcon, SpeedIcon } from '../icons/Icons'
import { IconButton } from '../button/IconButton'
import { StretchedLink } from './StretchedLink'

const meta = {
  title: 'Actions/StretchedLink',
  component: StretchedLink,
  args: { label: 'Open speed test', onClick: fn() },
} satisfies Meta<typeof StretchedLink>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The link itself is invisible: it lies over the whole card, whose content
 * shows through, so a click anywhere on the card opens what it summarises.
 */
export const OverCard: Story = {
  render: (args) => (
    <Card as="div" className="group relative flex max-w-[280px] flex-col gap-8 p-14">
      <div className="flex items-center gap-8">
        <SpeedIcon size={16} className="text-tertiary" />
        <h2 className="text-heading-small">Speed</h2>
        <ChevronRightIcon size={16} className="ml-auto text-tertiary group-hover:text-secondary" />
      </div>
      <StretchedLink {...args} />
      <span className="text-sm text-secondary">412 Mbps down, 38 Mbps up</span>
    </Card>
  ),
}

/** Focused from the keyboard: the ring shows the area the link covers. */
export const Focused: Story = {
  ...OverCard,
  play: async ({ userEvent }) => {
    await userEvent.tab()
  },
}

/** A control in the container raises itself above the link and stays a sibling. */
export const WithControl: Story = {
  args: { label: 'Open Google' },
  render: (args) => (
    <Card as="div" className="relative flex max-w-[280px] items-center gap-8 py-8 pr-8 pl-14 hover:bg-fill-faint">
      <span className="text-md font-medium text-primary">Google</span>
      <span className="text-sm text-tertiary">18 ms</span>
      <StretchedLink {...args} />
      <IconButton variant="ghost" label="Options for Google" icon={MoreVerticalIcon} className="relative z-2 ml-auto" />
    </Card>
  ),
}
