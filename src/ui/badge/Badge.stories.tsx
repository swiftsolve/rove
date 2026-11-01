import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge, LiveBadge } from './Badge'

const meta = {
  title: 'Status and feedback/Badge',
  component: Badge,
  args: { tone: 'positive', children: 'Up' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['positive', 'warning', 'negative'] },
  },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const Positive: Story = { args: { tone: 'positive', children: 'Up' } }

/** A heads-up, not an error: the ISP card's VPN flag. */
export const Warning: Story = { args: { tone: 'warning', children: 'VPN' } }

export const Negative: Story = { args: { tone: 'negative', children: 'Down' } }

/** The card's data is updating live. */
export const Live: Story = { render: () => <LiveBadge /> }

/** Every tone, and the Live pill. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-12">
      <Badge tone="positive">Up</Badge>
      <Badge tone="warning">VPN</Badge>
      <Badge tone="negative">Down</Badge>
      <LiveBadge />
      <LiveBadge>Streaming</LiveBadge>
    </div>
  ),
}
