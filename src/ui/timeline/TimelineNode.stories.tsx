import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { ArrowDownIcon, ArrowLeftIcon, CheckIcon, RefreshIcon, RouterIcon, SearchIcon } from '../icons/Icons'
import { TimelineNode } from './TimelineNode'

// The colours the app's timelines use. The marker takes any CSS colour.
const COLORS = [
  'var(--status-positive)',
  'var(--status-warning)',
  'var(--status-negative)',
  'var(--accent-default)',
  'neutral',
]

// An event's lines, as the timelines set them: what happened and when, then
// what it happened to.
function Lines({ title, subject, time = '1:24 PM' }: { title: string; subject: string; time?: string }) {
  return (
    <>
      <span className="flex items-baseline gap-10">
        <span className="type-heading min-w-0 flex-1 leading-[inherit] text-primary">{title}</span>
        <span className="type-body shrink-0 leading-[inherit] text-tertiary">{time}</span>
      </span>
      <span className="type-body text-secondary">{subject}</span>
    </>
  )
}

const meta = {
  title: 'Data display/TimelineNode',
  component: TimelineNode,
  args: {
    color: 'var(--status-positive)',
    icon: <RefreshIcon size={15} />,
    children: <Lines title="Device back online" subject="iPhone" />,
  },
  argTypes: {
    color: { control: 'select', options: COLORS },
    icon: { control: false },
    children: { control: false },
  },
  render: (args) => (
    <ol className="w-[360px]">
      <TimelineNode {...args} />
    </ol>
  ),
  parameters: {
    docs: {
      subtitle: 'One event on a timeline: a tinted marker, its lines, and a line to the next.',
      toc: GUIDANCE_TOC,
    },
    guidance: {
      whenToUse: [
        'One event in a timeline: “Device left the network”, “Service went down”.',
        'A day’s events in a feed, one node each under its heading.',
      ],
      whenNotToUse: [
        'An item that isn’t an event: use `IconTile` in its row.',
        'A message about the whole page: use `Banner`.',
      ],
      accessibility: {
        handledByComponent: [
          'An `<li>`: in a list, screen readers count the nodes.',
          'The marker is `aria-hidden`; the lines carry the event.',
        ],
        handledByYourCode: [
          'A `<ul role="list">` around the nodes.',
          'Lines that say what happened, not only colour or icon.',
          'A `<time>` for when it happened.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof TimelineNode>

export default meta
type Story = StoryObj<typeof meta>

/** A recovery: the marker washed in the positive colour. */
export const Default: Story = {}

/** A departure: a hollow ring, quiet rather than alarming. */
export const Neutral: Story = {
  args: {
    color: 'neutral',
    icon: <ArrowLeftIcon size={15} />,
    children: <Lines title="Device left" subject="iPhone" />,
  },
}

/** A day of events: the line runs from each marker to the next and ends at the last. */
export const Timeline: Story = {
  render: () => (
    <ol className="w-[360px]">
      <TimelineNode color="var(--status-negative)" icon={<ArrowDownIcon size={15} />}>
        <Lines title="Service went down" subject="Netflix" time="3:10 PM" />
      </TimelineNode>
      <TimelineNode color="var(--status-warning)" icon={<RouterIcon size={15} />}>
        <Lines title="New access point" subject="Guest Wi‑Fi" time="2:02 PM" />
      </TimelineNode>
      <TimelineNode color="neutral" icon={<ArrowLeftIcon size={15} />}>
        <Lines title="Device left" subject="iPad" time="1:47 PM" />
      </TimelineNode>
      <TimelineNode color="var(--status-positive)" icon={<CheckIcon size={15} />}>
        <Lines title="6 services running" subject="All services healthy" time="1:30 PM" />
      </TimelineNode>
      <TimelineNode color="var(--accent-default)" icon={<SearchIcon size={15} />}>
        <Lines title="First scan" subject="12 devices" time="1:24 PM" />
      </TimelineNode>
    </ol>
  ),
}
