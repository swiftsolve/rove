import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { MetricValue, type MetricStatus } from './MetricValue'

const formatMs = (n: number): string => `${Math.round(n)} ms`

const meta = {
  title: 'Data display/MetricValue',
  component: MetricValue,
  args: { value: 42, format: formatMs, className: 'text-number num' },
  argTypes: {
    status: { control: 'inline-radio', options: [undefined, 'positive', 'warning', 'negative'] },
    format: { control: false },
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

function PollingMetric(): JSX.Element {
  const [poll, setPoll] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setPoll((n) => (n + 1) % POLLS.length), 2000)
    return () => clearInterval(id)
  }, [])
  const value = POLLS[poll] ?? 0
  return <MetricValue value={value} status={statusOf(value)} format={formatMs} className="metric-value" />
}

/** A new poll every two seconds: it eases to each value, up or down. */
export const Easing: Story = { render: () => <PollingMetric /> }

/** Every status. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-baseline gap-20 text-number num">
      <MetricValue value={42} format={formatMs} />
      <MetricValue value={42} status="positive" format={formatMs} />
      <MetricValue value={180} status="warning" format={formatMs} />
      <MetricValue value={900} status="negative" format={formatMs} />
    </div>
  ),
}
