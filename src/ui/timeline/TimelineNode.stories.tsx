import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, RouterIcon, SearchIcon } from '../icons/Icons'
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
function Lines({ title, subject, time = '1:24 PM' }: { title: string; subject: string; time?: string }): JSX.Element {
  return (
    <>
      <span className="flex items-baseline gap-10">
        <span className="min-w-0 flex-1 text-lg font-semibold text-primary">{title}</span>
        <span className="shrink-0 text-sm text-tertiary">{time}</span>
      </span>
      <span className="text-md text-secondary">{subject}</span>
    </>
  )
}

const meta = {
  title: 'Data display/TimelineNode',
  component: TimelineNode,
  args: {
    color: 'var(--status-positive)',
    icon: <ArrowRightIcon size={15} />,
    children: <Lines title="Device joined" subject="iPhone" />,
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
} satisfies Meta<typeof TimelineNode>

export default meta
type Story = StoryObj<typeof meta>

/** An arrival: the marker washed in the positive colour. */
export const Default: Story = {}

/** A departure: a hollow ring, quiet rather than alarming. */
export const Neutral: Story = {
  args: { color: 'neutral', icon: <ArrowLeftIcon size={15} />, children: <Lines title="Device left" subject="iPhone" /> },
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
