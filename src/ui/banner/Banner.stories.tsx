import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, waitFor } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { Banner } from './Banner'

const meta = {
  title: 'Status and feedback/Banner',
  component: Banner,
  args: { variant: 'error', title: "Couldn't load devices", description: 'Rove keeps trying in the background.' },
  argTypes: { variant: { control: 'inline-radio', options: ['error'] }, onRetry: { control: false } },
  // It runs the width of the page's content area.
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A failure above a page: a load, refresh or action that didn’t work.',
        'A title for what failed, and a line on how old the data is or what happens next.',
        '`onRetry` when trying again can help. Leave it out when the page polls and heals itself.',
      ],
      avoid: [
        'Loaded, with nothing to show: use `EmptyState`.',
        'Still loading: use `LoadingState`.',
        'A short flag beside a title: use `Badge`.',
        'A choice to make before going on: use `Dialog`.',
      ],
      states: [
        '`variant="error"`: a red wash, a red Dismiss and a neutral Retry.',
        'Retry reads “Retrying…” until its promise settles. A failed retry leaves the banner up.',
        'Dismiss hides it until the title changes.',
      ],
      accessibility: {
        builtIn: [
          'An alert (`role="alert"`): screen readers read it as it appears.',
          'Dismiss and Retry are `Button`s, with their keyboard, focus ring and busy state.',
          'The icon is hidden from screen readers.',
        ],
        yours: [
          'A title that says what failed: “Couldn’t load devices”.',
          'A line that says what’s on screen now: “Showing figures from 5 minutes ago.”',
          'Rendering it only while there’s an error.',
        ],
      },
    } satisfies Guidance,
  },
  decorators: [
    (Story) => (
      <div className="w-[480px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Banner>

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

/** Dismiss hides it. */
export const Dismissing: Story = {
  tags: ['!autodocs'],
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent("Couldn't load devices")
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }))
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
  },
}

/** Retry runs the retry and shows busy, then settles once it does. */
export const Retrying: Story = {
  tags: ['!autodocs'],
  args: {
    title: 'Speed test failed',
    description: "The server didn't answer.",
    onRetry: fn(() => new Promise<void>((resolve) => setTimeout(resolve, 300))),
  },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }))
    await expect(args.onRetry).toHaveBeenCalledOnce()
    await expect(canvas.getByRole('button', { name: 'Retrying…' })).toHaveAttribute('aria-busy', 'true')
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Retry' })).not.toHaveAttribute('aria-busy'))
    await expect(canvas.getByRole('alert')).toBeInTheDocument()
  },
}
