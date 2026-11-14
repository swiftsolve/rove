import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../.storybook/docs-page'
import { Spinner } from './Spinner'

const meta = {
  title: 'Status and feedback/Spinner',
  component: Spinner,
  args: { size: 24 },
  parameters: {
    docs: { subtitle: 'The loading indicator, in the accent colour.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'A wait inside a dialog: “Generating QR code…”.',
        'A wait with more than one line: “Looking for your network…”.',
      ],
      whenNotToUse: [
        'A page’s first load: use `LoadingState`.',
        'A button’s wait: set `isLoading` on `Button` or `IconButton`.',
        'A wait inside a `<button>`: use `ButtonSpinner`.',
      ],
      accessibility: {
        builtIn: ['Silent: no role or text, so screen readers skip it.'],
        toHandle: ['Words for the wait, in a `role="status"` or live region.'],
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
