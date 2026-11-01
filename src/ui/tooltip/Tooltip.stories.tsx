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
    align: { control: 'inline-radio', options: ['start', 'end'] },
  },
  // Room on every side for the bubble.
  decorators: [
    (Story) => (
      <div className="flex h-[160px] items-center justify-center">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

/** Hover or focus the button to show it. */
export const Bottom: Story = {}

export const Top: Story = { args: { side: 'top' } }

/** Beside the trigger, vertically centred: the nav rail. */
export const Right: Story = { args: { side: 'right' } }

export const Left: Story = { args: { side: 'left' } }

/** Grows rightward from the trigger's left edge. */
export const AlignStart: Story = { args: { align: 'start' } }

/** Content past the max width wraps. */
export const Wrapping: Story = {
  args: {
    content: 'Rated on the worst of latency, jitter and loss. A new test replaces it.',
    children: <Button>Rating</Button>,
  },
}

/** Never opens: content that would be stale while a new test runs. */
export const Disabled: Story = { args: { isDisabled: true } }

/** Shown: hovered once the story loads. Tooltip has no prop to render it open. */
export const Shown: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.hover(canvas.getByRole('button'))
  },
}

/** Each side, hover each button. */
export const AllSides: Story = {
  render: () => (
    <div className="flex items-center gap-12">
      {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
        <Tooltip key={side} content={`Opens on the ${side}.`} side={side}>
          <Button>{side}</Button>
        </Tooltip>
      ))}
    </div>
  ),
}
