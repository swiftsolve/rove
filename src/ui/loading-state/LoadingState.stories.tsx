import type { Meta, StoryObj } from '@storybook/react-vite'
import { LoadingState } from './LoadingState'

const meta = {
  title: 'Status and feedback/LoadingState',
  component: LoadingState,
  args: { label: 'Loading usage…' },
  // It fills the page's content area, so it gets a box to centre in.
  decorators: [
    (Story) => (
      <div className="flex h-[280px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LoadingState>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** The first scan of the network, which takes a few seconds. */
export const Scanning: Story = { args: { label: 'Scanning your network…' } }
