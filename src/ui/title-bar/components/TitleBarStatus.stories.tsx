import type { Meta, StoryObj } from '@storybook/react-vite'

import { TitleBarStatus } from './TitleBarStatus'

const meta = {
  title: 'App frame/TitleBar/TitleBarStatus',
  component: TitleBarStatus,
  args: { tone: 'positive', children: 'Wi‑Fi' },
  argTypes: { tone: { control: 'inline-radio', options: ['positive', 'negative', 'neutral'] } },
} satisfies Meta<typeof TitleBarStatus>

export default meta
type Story = StoryObj<typeof meta>

/** Online: the dot pulses green. */
export const Positive: Story = {}

/** Connected, but the internet is down. */
export const Negative: Story = { args: { tone: 'negative', children: 'No internet' } }

/** No network info yet, or offline. */
export const Neutral: Story = { args: { tone: 'neutral', children: 'Connecting…' } }
