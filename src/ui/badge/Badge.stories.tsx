import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { Badge, LiveBadge } from './Badge'

const meta = {
  title: 'Status and feedback/Badge',
  component: Badge,
  args: { tone: 'positive', children: 'Up' },
  parameters: {
    docs: { subtitle: 'A small tinted flag in capitals, beside a title.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'A word or two flagging a title: the ISP card’s VPN.',
        'A card whose data updates live, `LiveBadge` in its header: Traffic.',
      ],
      whenNotToUse: [
        'A status beside its own words: use `StatusDot`.',
        'A failure the user should act on: use `Banner`.',
      ],
      accessibility: {
        handledByComponent: [
          'Plain text; capitals come from CSS, so it’s read as typed.',
          '`LiveBadge`’s dot is hidden from screen readers.',
        ],
        handledByYourCode: ['Words that carry the meaning without the colour.'],
      },
    } satisfies Guidance,
  },
  argTypes: {
    tone: { control: 'inline-radio', options: ['positive', 'warning', 'negative'] },
  },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

/** Good news: the ISP card's VPN flag. */
export const Positive: Story = { args: { tone: 'positive', children: 'VPN' } }

/** A heads-up, not an error. */
export const Warning: Story = { args: { tone: 'warning', children: 'Slow' } }

export const Negative: Story = { args: { tone: 'negative', children: 'Down' } }

/** The card's data is updating live. */
export const Live: Story = { render: () => <LiveBadge /> }

/** Every tone, and the Live pill. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-12">
      <Badge tone="positive">VPN</Badge>
      <Badge tone="warning">Slow</Badge>
      <Badge tone="negative">Down</Badge>
      <LiveBadge />
      <LiveBadge>Streaming</LiveBadge>
    </div>
  ),
}
