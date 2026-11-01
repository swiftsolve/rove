import type { Meta, StoryObj } from '@storybook/react-vite'
import { Spinner } from './Spinner'

const meta = {
  title: 'Status and feedback/Spinner',
  component: Spinner,
  args: { size: 24 },
  argTypes: {
    size: { control: { type: 'number', min: 12, max: 64, step: 2 } },
  },
} satisfies Meta<typeof Spinner>

export default meta
type Story = StoryObj<typeof meta>

/** A page's first load. LoadingState puts it over a line of words. */
export const Default: Story = {}

/** Inline, beside a line of text. */
export const Small: Story = { args: { size: 16 } }
