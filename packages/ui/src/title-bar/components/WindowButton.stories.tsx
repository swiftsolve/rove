import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { WindowButton } from './WindowButton'

const meta = {
  title: 'App frame/TitleBar/WindowButton',
  component: WindowButton,
  args: { action: 'minimize', onClick: fn() },
  argTypes: { action: { control: 'inline-radio', options: ['minimize', 'close'] } },
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: ['Minimise and close, at the end of a frameless window’s title bar.'],
      whenNotToUse: ['An icon action anywhere else: use `IconButton`.'],
      accessibility: {
        builtIn: ['Named “Minimize” or “Close” by its `action`.', 'Out of the Tab order, like a native title bar’s.'],
        toHandle: ['Nothing beyond `action`: it sets the name and icon.'],
      },
    } satisfies Guidance,
  },
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
