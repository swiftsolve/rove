import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { GlobeIcon, HistoryIcon, PlayIcon } from '../icons/Icons'
import { ViewLink } from './ViewLink'

const meta = {
  title: 'Actions/ViewLink',
  component: ViewLink,
  args: { children: 'All hosts', icon: GlobeIcon, onClick: fn() },
  argTypes: { icon: { control: false } },
  // At the size of the text it sits in.
  render: (args) => (
    <span className="text-caption">
      <ViewLink {...args} />
    </span>
  ),
} satisfies Meta<typeof ViewLink>

export default meta
type Story = StoryObj<typeof meta>

export const WithIcon: Story = {}

export const WithoutIcon: Story = { args: { icon: undefined, children: 'View timeline' } }

/** Still focusable, so a tooltip can say why. */
export const Disabled: Story = { args: { isDisabled: true } }

/** It takes the size of the text around it. */
export const SmallText: Story = {
  args: { icon: HistoryIcon, children: 'History' },
  render: (args) => (
    <span className="text-xs">
      <ViewLink {...args} />
    </span>
  ),
}

/** Every state, at two text sizes. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      <span className="inline-flex items-center gap-12 text-caption">
        <ViewLink icon={GlobeIcon}>All hosts</ViewLink>
        <ViewLink>View timeline</ViewLink>
        <ViewLink icon={GlobeIcon} isDisabled>
          Disabled
        </ViewLink>
      </span>
      <span className="inline-flex items-center gap-12 text-xs">
        <ViewLink icon={PlayIcon}>Small text</ViewLink>
        <ViewLink icon={PlayIcon} isDisabled>
          Disabled
        </ViewLink>
      </span>
    </div>
  ),
}
