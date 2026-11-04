import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { type MetricStatus, MetricValue } from './MetricValue'

const formatMs = (n: number): string => `${Math.round(n)} ms`

const meta = {
  title: 'Data display/MetricValue',
  component: MetricValue,
  args: { value: 42, format: formatMs },
  argTypes: {
    status: { control: 'inline-radio', options: [undefined, 'positive', 'warning', 'negative'] },
    format: { control: false },
  },
  // It takes its size and colour from the text it sits in.
  decorators: [
    (Story) => (
      <span className="type-number-default text-primary">
        <Story />
      </span>
    ),
  ],
  parameters: {
    docs: { subtitle: 'A number that eases to each new value, at the size of its line.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'A number that changes each poll: latency, packet loss.',
        'A value with a healthy range, coloured by `status`: latency.',
        'A number inside text that sets its size: a data row’s value.',
      ],
      whenNotToUse: [
        'A headline figure with its unit and label: use `Readout`.',
        'A value that never changes: use `DataRow`’s `value`.',
      ],
      accessibility: {
        builtIn: [
          'Snaps to each new value under reduced motion.',
          'Plain text: screen readers read the number shown.',
          'A null `format` draws `NoValue`, heard as “None”.',
        ],
        toHandle: [
          'A label around it that says what it measures.',
          'The status in words where it matters, not only colour.',
          'A change worth announcing, through `ScreenReaderStatus`.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof MetricValue>

export default meta
type Story = StoryObj<typeof meta>

/** No status: the value hasn't earned a colour. Change `value` to watch it ease. */
export const Default: Story = {}

export const Positive: Story = { args: { status: 'positive' } }

export const Warning: Story = { args: { value: 180, status: 'warning' } }

export const Negative: Story = { args: { value: 900, status: 'negative' } }

// Latency a service might report on successive polls.
const POLLS = [24, 38, 180, 62, 900, 31]

function statusOf(ms: number): MetricStatus {
  if (ms <= 50) return 'positive'
  if (ms <= 200) return 'warning'
  return 'negative'
}

function PollingMetric() {
  const [poll, setPoll] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setPoll((n) => (n + 1) % POLLS.length), 2000)
    return () => clearInterval(id)
  }, [])
  const value = POLLS[poll] ?? 0
  return (
    <span className="type-number-display metric-value">
      <MetricValue value={value} status={statusOf(value)} format={formatMs} />
    </span>
  )
}

/** A new poll every two seconds: it eases to each value, up or down. */
export const Easing: Story = { render: () => <PollingMetric /> }

/** Every status. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-baseline gap-20">
      <MetricValue value={42} format={formatMs} />
      <MetricValue value={42} status="positive" format={formatMs} />
      <MetricValue value={180} status="warning" format={formatMs} />
      <MetricValue value={900} status="negative" format={formatMs} />
    </div>
  ),
}
