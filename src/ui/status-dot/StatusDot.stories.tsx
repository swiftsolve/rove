import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatusDot } from './StatusDot'

// The dot is decorative, so each story shows it beside the words it marks.
const WORDS = { none: 'Online', calm: 'Connected', live: 'Live', busy: 'Scanning…' }

const meta = {
  title: 'Status and feedback/StatusDot',
  component: StatusDot,
  args: { className: 'text-status-positive' },
  argTypes: {
    pulse: { control: 'inline-radio', options: [undefined, 'calm', 'live', 'busy'] },
  },
  render: (args) => (
    <span className="inline-flex items-center gap-6 text-caption text-secondary">
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

/** In a status colour other than the text's. */
export const Warning: Story = { args: { pulse: 'calm', className: 'text-status-warning' } }

/** Every pulse, in each status colour. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      {['text-status-positive', 'text-status-warning', 'text-status-negative'].map((color) => (
        <div key={color} className="flex flex-wrap items-center gap-20">
          {([undefined, 'calm', 'live', 'busy'] as const).map((pulse) => (
            <span key={pulse ?? 'none'} className="inline-flex items-center gap-6 text-caption text-secondary">
              <StatusDot pulse={pulse} className={color} />
              {WORDS[pulse ?? 'none']}
            </span>
          ))}
        </div>
      ))}
    </div>
  ),
}
