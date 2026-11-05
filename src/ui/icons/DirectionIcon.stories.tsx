import type { Meta, StoryObj } from '@storybook/react-vite'

import { DirectionIcon } from './DirectionIcon'

const READOUTS = [
  ['down', 'Download', '412 Mbps'],
  ['up', 'Upload', '38 Mbps'],
] as const

const meta = {
  title: 'Icons/DirectionIcon',
  component: DirectionIcon,
  args: { series: 'down' },
  argTypes: {
    series: { control: 'inline-radio', options: ['down', 'up'] },
    size: { control: { type: 'range', min: 10, max: 32, step: 1 } },
  },
} satisfies Meta<typeof DirectionIcon>

export default meta
type Story = StoryObj<typeof meta>

/** Blue, pointing down. */
export const Download: Story = {}

/** Purple, pointing up. */
export const Upload: Story = { args: { series: 'up' } }

/** Both, marking a speed test's readouts. */
export const AllStates: Story = {
  render: () => (
    <dl className="flex gap-20">
      {READOUTS.map(([series, label, value]) => (
        <div key={series} className="flex flex-col gap-8">
          <dt className="flex items-center gap-6">
            <DirectionIcon series={series} />
            <span className="type-label-field text-tertiary">{label}</span>
          </dt>
          <dd className="type-number-default text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  ),
}
