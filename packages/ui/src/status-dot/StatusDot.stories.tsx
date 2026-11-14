import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'

import { type Guidance, GUIDANCE_TOC } from '../../.storybook/docs-page'
import { useSecondTicks } from '../../.storybook/use-second-ticks'
import { StatusDot } from './StatusDot'

// The dot is decorative, so each story shows it beside the words it marks.
const WORDS = { none: 'Online', calm: 'Connected', live: 'Live', busy: 'Scanning…' }

/** A StatusDot as the app runs it: a `live` one takes a new key each second, as each sample lands. */
function TickingStatusDot(props: ComponentProps<typeof StatusDot>) {
  const tickedAt = useSecondTicks()
  const liveKey = props.pulse === 'live' ? tickedAt : undefined
  return <StatusDot key={liveKey} {...props} />
}

const meta = {
  title: 'Status and feedback/StatusDot',
  component: StatusDot,
  args: { tone: 'positive' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['current', 'positive', 'accent'] },
    pulse: { control: 'inline-radio', options: [undefined, 'calm', 'live', 'busy'] },
  },
  parameters: {
    docs: { subtitle: 'A small coloured dot beside the words of a status.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'A status in the words beside it: a device’s Online or Offline.',
        'A live or busy state, pulsing: the title bar, a running scan.',
      ],
      whenNotToUse: ['A flag beside a title: use `Badge`.', 'Live data in a card header: use `LiveBadge`.'],
      accessibility: {
        builtIn: ['Hidden from screen readers (`aria-hidden`).'],
        toHandle: ['Words beside it that say the status on their own.'],
      },
    } satisfies Guidance,
  },
  render: (args) => (
    <span className="type-caption inline-flex items-center gap-6 text-secondary">
      <TickingStatusDot {...args} />
      {WORDS[args.pulse ?? 'none']}
    </span>
  ),
} satisfies Meta<typeof StatusDot>

export default meta
type Story = StoryObj<typeof meta>

/** Still: a device that answered the last scan. */
export const Default: Story = {}

/** A steady state: a slow, shallow breath. */
export const Calm: Story = { args: { pulse: 'calm' } }

/** Data streaming in: one quicker, deeper breath per update, here once a second. */
export const Live: Story = { args: { pulse: 'live' } }

/** Work under way, in the accent, with a quick deep throb: a scan is activity, not health. */
export const Busy: Story = { args: { tone: 'accent', pulse: 'busy' } }

/** In its words' colour: here, amber words. */
export const Current: Story = {
  args: { tone: 'current', pulse: 'calm' },
  render: (args) => (
    <span className="type-caption inline-flex items-center gap-6 text-warning">
      <StatusDot {...args} />
      Degraded
    </span>
  ),
}

/** Every pulse: green, then the accent, beside quiet words, then in the words' own colour. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      {(
        [
          ['positive', 'text-secondary'],
          ['accent', 'text-secondary'],
          ['current', 'text-positive'],
          ['current', 'text-warning'],
          ['current', 'text-negative'],
        ] as const
      ).map(([tone, words]) => (
        <div key={tone + words} className={`type-caption flex flex-wrap items-center gap-20 ${words}`}>
          {([undefined, 'calm', 'live', 'busy'] as const).map((pulse) => (
            <span key={pulse ?? 'none'} className="inline-flex items-center gap-6">
              <TickingStatusDot tone={tone} pulse={pulse} />
              {WORDS[pulse ?? 'none']}
            </span>
          ))}
        </div>
      ))}
    </div>
  ),
}
