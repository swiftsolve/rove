import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../../.storybook/docs-page'
import { TitleBarStatus } from './TitleBarStatus'

const meta = {
  title: 'App frame/TitleBar/TitleBarStatus',
  component: TitleBarStatus,
  args: { tone: 'positive', children: 'Online' },
  argTypes: { tone: { control: 'inline-radio', options: ['positive', 'negative', 'neutral'] } },
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: ['The connection in a word or two, beside the brand: “Online”, “No internet”.'],
      whenNotToUse: ['A status anywhere else: use a `StatusDot` beside its words.'],
      accessibility: {
        builtIn: ['`role="status"`, so a change is read out.', 'The dot is hidden from screen readers.'],
        toHandle: ['Words that make sense heard alone: “No internet”.'],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof TitleBarStatus>

export default meta
type Story = StoryObj<typeof meta>

/** Online: the dot pulses green. */
export const Positive: Story = {}

/** Connected, but the internet is down. */
export const Negative: Story = { args: { tone: 'negative', children: 'No internet' } }

/** No network info yet, or offline. */
export const Neutral: Story = { args: { tone: 'neutral', children: 'Connecting…' } }
