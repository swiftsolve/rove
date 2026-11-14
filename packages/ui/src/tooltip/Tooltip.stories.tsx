import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../.storybook/docs-page'
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
  parameters: {
    docs: { subtitle: 'A short hint beside its trigger, on hover and keyboard focus.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'Why a control is off: “Connect to a network first”.',
        'What a mark means: “Privacy-randomized MAC address”.',
        'Detail that would crowd a row, like a host’s full name and IP.',
      ],
      whenNotToUse: [
        'Naming an icon-only button: use `IconButton`; its `label` is the tooltip.',
        'A message the user must see: use `Banner`.',
        'Anything to click: use `Menu` or `Dialog`.',
        'A value that may be stale, like a rating while a new test runs: set `isDisabled`.',
      ],
      accessibility: {
        builtIn: [
          'Opens on keyboard focus, not only on hover.',
          'Its content describes the trigger, after any description it had.',
          'No description when it repeats the trigger’s `aria-label`.',
        ],
        toHandle: [
          'A focusable trigger: keyboard users can’t reach a tip on plain text.',
          'Over plain text, `shouldDescribe={false}` and the hint in `sr-only` text.',
        ],
      },
    } satisfies Guidance,
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
