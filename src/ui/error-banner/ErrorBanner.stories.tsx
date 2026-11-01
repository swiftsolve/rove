import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ErrorBanner, POLLING_DESCRIPTION } from './ErrorBanner'

const meta = {
  title: 'Status and feedback/ErrorBanner',
  component: ErrorBanner,
  args: { title: "Couldn't load devices", description: POLLING_DESCRIPTION },
  argTypes: { onRetry: { control: false } },
} satisfies Meta<typeof ErrorBanner>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A page whose data polls: no Retry, as the failure heals itself. Dismiss
 * hides it until the title changes; reload the story to bring it back.
 */
export const Polling: Story = {}

/** Retry stays busy until the retry settles, here after a second and a half. */
export const WithRetry: Story = {
  args: {
    title: 'Speed test failed',
    description: "The server didn't answer.",
    onRetry: fn(() => new Promise<void>((resolve) => setTimeout(resolve, 1500))),
  },
}

/** A failure that leaves old data on screen says how old it is. */
export const Stale: Story = {
  args: {
    title: "Couldn't refresh usage",
    description: 'Showing figures from 5 minutes ago.',
    onRetry: fn(() => Promise.resolve()),
  },
}
