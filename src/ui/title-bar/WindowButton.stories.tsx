import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { WindowButton } from './TitleBar'

const meta = {
  title: 'App frame/TitleBar/WindowButton',
  component: WindowButton,
  args: { action: 'minimize', onClick: fn() },
  argTypes: { action: { control: 'inline-radio', options: ['minimize', 'close'] } },
} satisfies Meta<typeof WindowButton>

export default meta
type Story = StoryObj<typeof meta>

/** Hover for its tint. */
export const Minimize: Story = {}

/** Turns red on hover. */
export const Close: Story = { args: { action: 'close' } }
