import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { Spinner } from './Spinner'

const meta = {
  title: 'Status and feedback/Spinner',
  component: Spinner,
  args: { size: 24 },
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A wait inside a dialog or panel, over a line saying what’s coming.',
        'The one loading indicator, in the accent, so every wait looks alike.',
        'Small (`size={16}`) beside a line of text.',
      ],
      avoid: [
        'A page’s first load: use `LoadingState`, which holds it.',
        'A button’s wait: set `isLoading` on `Button` or `IconButton`.',
        'Inside a `<button>`: use `ButtonSpinner`, which is valid there.',
      ],
      accessibility: {
        builtIn: ['Silent: no role or text, so screen readers skip it.', 'Stops moving under reduced motion.'],
        youHandle: [
          'Words for what’s loading, in a `role="status"` region so they’re announced.',
          'Keeping it out of a `<button>`: it’s a `<div>`.',
          'Its centring and spacing.',
        ],
      },
    } satisfies Guidance,
  },
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
