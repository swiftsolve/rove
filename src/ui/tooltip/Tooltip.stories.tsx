import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
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
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A short hint on a control: what a value means, or why a button is off.',
        'Detail that would crowd the row, like a host’s address.',
        '`side="right"` beside the nav rail.',
      ],
      avoid: [
        'Naming an icon-only button: use `IconButton`, whose `label` is its tooltip.',
        'Anything to click or act on: use `Dialog` or `Menu`.',
        'A message the user must see: use `Banner`.',
      ],
      states: [
        'Opens at once on hover and keyboard focus. A click hides it.',
        'Below its trigger by default. `side` puts it above or beside, and it flips and slides to stay in the window.',
        'Wraps past `maxWidth`, 260px by default.',
        '`isDisabled` never opens it, for content that would be stale.',
      ],
      accessibility: {
        builtIn: [
          'Opens on keyboard focus, not only on hover.',
          'Screen readers hear the content as the trigger’s description, after any it already had.',
          'No description when it only repeats the trigger’s `aria-label`.',
          'The bubble itself is hidden from screen readers, so nothing is read twice.',
        ],
        yours: [
          'A focusable trigger, like a `Button`: keyboard users can’t reach a tip on plain text.',
          'Over plain text, `shouldDescribe={false}` and the hint in `sr-only` text too.',
          'Two short sentences at most, and nothing needed to finish a task.',
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
