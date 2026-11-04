import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

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

/** A click runs it; like the OS's own, it stays out of the tab order. */
export const Pressing: Story = {
  args: { action: 'close' },
  tags: ['!autodocs'],
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Close' })
    await expect(button).toHaveAttribute('tabindex', '-1')
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalledOnce()
  },
}
