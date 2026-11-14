import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../.storybook/docs-page'
import { useSecondTicks } from '../../.storybook/use-second-ticks'
import { Badge, LiveBadge } from './Badge'

/** A LiveBadge whose data updates once a second, like the Traffic card's. */
function TickingLiveBadge({ children }: { children?: string }) {
  const tickedAt = useSecondTicks()
  return <LiveBadge updatedAt={tickedAt}>{children}</LiveBadge>
}

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
        builtIn: [
          'Plain text; capitals come from CSS, so it’s read as typed.',
          '`LiveBadge`’s dot is hidden from screen readers.',
        ],
        toHandle: ['Words that carry the meaning without the colour.'],
      },
    } satisfies Guidance,
    partGuidance: {
      LiveBadge: {
        whenToUse: ['A card whose numbers update live, in its header: Traffic.'],
        whenNotToUse: ['A word or two flagging a title: use `Badge`.', 'A connection status: use `StatusDot`.'],
        accessibility: {
          builtIn: ['Its dot is hidden from screen readers.'],
          toHandle: ['Words that say it’s live without the dot: “Live”.'],
        },
      },
    } satisfies Record<string, Guidance>,
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

/** The card's data is updating live: the dot breathes once per update, here once a second. */
export const Live: Story = { render: () => <TickingLiveBadge /> }

/** Every tone, and the Live pill. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-12">
      <Badge tone="positive">VPN</Badge>
      <Badge tone="warning">Slow</Badge>
      <Badge tone="negative">Down</Badge>
      <TickingLiveBadge />
      <TickingLiveBadge>Streaming</TickingLiveBadge>
    </div>
  ),
}
