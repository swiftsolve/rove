import type { Meta, StoryObj } from '@storybook/react-vite'

import { InlineMeta } from './DotSeparator'

const meta = {
  title: 'Containers/DotSeparator/InlineMeta',
  component: InlineMeta,
  args: { items: ['192.168.1.20', 'Apple', null, '2 min ago'], shouldTruncate: false },
  argTypes: { className: { control: false } },
  // It takes its type from the line it sits in; a narrow one shows truncation.
  render: (args) => (
    <span className="block w-[200px] type-body-small text-secondary">
      <InlineMeta {...args} />
    </span>
  ),
} satisfies Meta<typeof InlineMeta>

export default meta
type Story = StoryObj<typeof meta>

/** A dot between the items; the empty ones drop out, and the rest wrap. */
export const Default: Story = {}

/** One line, each item ellipsizing as space runs out. */
export const Truncated: Story = {
  args: { items: ['a-very-long-hostname.local', 'Raspberry Pi Foundation', 'now'], shouldTruncate: true },
}
