import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { Badge, LiveBadge } from './Badge'

const meta = {
  title: 'Status and feedback/Badge',
  component: Badge,
  args: { tone: 'positive', children: 'Up' },
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A word or two that flags a title, like the ISP card’s VPN.',
        'Green for good news, amber for a caveat, red for a fault.',
        '`LiveBadge` in a card header whose data updates live.',
      ],
      avoid: [
        'A status beside its own words: use `StatusDot`.',
        'A failure the user should act on: use `Banner`.',
        'Something to press: use `Button`.',
      ],
      accessibility: {
        builtIn: [
          'Plain text: screen readers read its words.',
          'Capitals come from the style, so the words are read as written.',
          '`LiveBadge`’s dot is hidden from screen readers, and stops pulsing under reduced motion.',
        ],
        youHandle: ['Words that say it without the colour: “Down”, not a red blank.', 'A word or two, no more.'],
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
