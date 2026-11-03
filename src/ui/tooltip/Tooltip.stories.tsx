import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from '../button/Button'
import { Tooltip } from './Tooltip'

const meta = {
  title: 'Overlays/Tooltip',
  component: Tooltip,
  args: { content: 'Your router, at 192.168.1.1.', children: <Button>Gateway</Button> },
  argTypes: {
    children: { control: false },
    side: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] },
  },
  // Room on every side for the bubble.
  decorators: [
    (Story) => (
      <div className="flex h-[160px] items-center justify-center">
        <Story />
      </div>
    ),
  ],
  // Tooltip has no prop to render it open, so each story hovers its trigger.
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByRole('button'))
  },
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

export const Bottom: Story = {}

export const Top: Story = { args: { side: 'top' } }

/** Beside the trigger, vertically centred: the nav rail. */
export const Right: Story = { args: { side: 'right' } }

export const Left: Story = { args: { side: 'left' } }

/** Content past the max width wraps. */
export const Wrapping: Story = {
  args: {
    content: 'Rated on the worst of latency, jitter and loss. A new test replaces it.',
    children: <Button>Rating</Button>,
  },
}

/** Never opens: content that would be stale while a new test runs. */
export const Disabled: Story = { args: { isDisabled: true } }
