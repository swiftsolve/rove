import type { Meta, StoryObj } from '@storybook/react-vite'

import { ButtonSpinner } from './ButtonSpinner'

const meta = {
  title: 'Status and feedback/ButtonSpinner',
  component: ButtonSpinner,
  args: { size: 14 },
  argTypes: {
    size: { control: { type: 'number', min: 10, max: 32, step: 1 } },
    color: { control: 'text' },
  },
  // It takes its colour from the text around it, as it does in a button.
  render: (args) => (
    <span className="inline-flex text-secondary">
      <ButtonSpinner {...args} />
    </span>
  ),
} satisfies Meta<typeof ButtonSpinner>

export default meta
type Story = StoryObj<typeof meta>

/** The text colour around it. A loading Button draws this for you. */
export const Default: Story = {}

/** Outside a button, in the accent. */
export const Accent: Story = { args: { size: 16, color: 'var(--accent-default)' } }

/** Beside the words it stands for, outside a button. */
export const WithLabel: Story = {
  render: (args) => (
    <span className="inline-flex items-center gap-6 type-caption text-secondary">
      <ButtonSpinner {...args} />
      Retrying…
    </span>
  ),
}
