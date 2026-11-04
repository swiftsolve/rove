import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { StatusDot } from './StatusDot'

// The dot is decorative, so each story shows it beside the words it marks.
const WORDS = { none: 'Online', calm: 'Connected', live: 'Live', busy: 'Scanning…' }

const meta = {
  title: 'Status and feedback/StatusDot',
  component: StatusDot,
  args: { tone: 'positive' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['current', 'positive'] },
    pulse: { control: 'inline-radio', options: [undefined, 'calm', 'live', 'busy'] },
  },
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A status beside its words: a device online, a scan running.',
        '`tone="positive"` when the words stay quiet; otherwise it takes their colour.',
        '`pulse` at the pace of what it marks: `calm` connected, `live` streaming, `busy` a scan.',
      ],
      avoid: [
        'A flag beside a title: use `Badge`.',
        'Live data in a card header: use `LiveBadge`.',
        'A page’s first load: use `LoadingState`.',
      ],
      accessibility: {
        builtIn: [
          'Hidden from screen readers (`aria-hidden`): the words carry the status.',
          'Its pulse stops under reduced motion.',
        ],
        youHandle: [
          'Words beside it that say the status on their own.',
          'Never a meaning only the colour or pulse carries.',
        ],
      },
    } satisfies Guidance,
  },
  render: (args) => (
    <span className="inline-flex items-center gap-6 type-caption text-secondary">
      <StatusDot {...args} />
      {WORDS[args.pulse ?? 'none']}
    </span>
  ),
} satisfies Meta<typeof StatusDot>

export default meta
type Story = StoryObj<typeof meta>

/** Still: a device that answered the last scan. */
export const Default: Story = {}

/** A steady state. */
export const Calm: Story = { args: { pulse: 'calm' } }

/** Data streaming in. */
export const Live: Story = { args: { pulse: 'live' } }

/** Work under way. */
export const Busy: Story = { args: { pulse: 'busy' } }

/** In its words' colour: here, amber words. */
export const Current: Story = {
  args: { tone: 'current', pulse: 'calm' },
  render: (args) => (
    <span className="inline-flex items-center gap-6 type-caption text-warning">
      <StatusDot {...args} />
      Degraded
    </span>
  ),
}

/** Every pulse: green beside quiet words, then in the words' own colour. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      {(
        [
          ['positive', 'text-secondary'],
          ['current', 'text-positive'],
          ['current', 'text-warning'],
          ['current', 'text-negative'],
        ] as const
      ).map(([tone, words]) => (
        <div key={words} className={`flex flex-wrap items-center gap-20 type-caption ${words}`}>
          {([undefined, 'calm', 'live', 'busy'] as const).map((pulse) => (
            <span key={pulse ?? 'none'} className="inline-flex items-center gap-6">
              <StatusDot tone={tone} pulse={pulse} />
              {WORDS[pulse ?? 'none']}
            </span>
          ))}
        </div>
      ))}
    </div>
  ),
}
