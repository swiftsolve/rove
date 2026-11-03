import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ChevronRightIcon, SpeedIcon } from '../icons/Icons'
import { StretchedLink } from './StretchedLink'

const meta = {
  title: 'Actions/StretchedLink',
  component: StretchedLink,
  args: { label: 'Open speed test', onClick: fn() },
} satisfies Meta<typeof StretchedLink>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The link itself is invisible: it lies over the whole row, whose content
 * shows through, so a click anywhere on it opens what it summarises. A Card
 * draws its own with `onOpen`.
 */
export const OverRow: Story = {
  render: (args) => (
    <div className="surface group relative flex w-[280px] items-center gap-8 px-14 py-10 hover:bg-fill-faint">
      <SpeedIcon size={16} className="text-tertiary" />
      <span className="text-md font-medium text-primary">Speed</span>
      <span className="text-sm text-tertiary">412 Mbps</span>
      <StretchedLink {...args} />
      <ChevronRightIcon size={16} className="ml-auto text-tertiary group-hover:text-secondary" />
    </div>
  ),
}

/** Focused from the keyboard: the ring shows the area the link covers. */
export const Focused: Story = {
  ...OverRow,
  // The ring keyboard focus draws, shown here for good: on a Docs page only
  // one story could hold real focus.
  args: { className: '[outline:var(--focus-outline)] outline-offset-(--focus-inset)' },
}
