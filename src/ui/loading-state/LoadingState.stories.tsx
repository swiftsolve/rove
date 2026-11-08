import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { LoadingState } from './LoadingState'

const meta = {
  title: 'Status and feedback/LoadingState',
  component: LoadingState,
  args: { label: 'Loading usage…' },
  // It fills the page's content area, so it gets a box to centre in.
  parameters: {
    docs: { subtitle: 'A page’s first load: the spinner over a line saying what’s coming.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: ['A page’s first load, in place of its content, under the header and any `Banner`.'],
      whenNotToUse: [
        'A page loaded with nothing to show: use `EmptyState`.',
        'A load that failed: use `Banner`.',
        'A wait inside a dialog: use `Spinner`.',
      ],
      accessibility: {
        handledByComponent: [
          'A status region (`role="status"`), so the label is announced.',
          'The spinner is silent; the label speaks for it.',
        ],
        handledByYourCode: [
          'A label naming what’s loading: “Scanning your network…”.',
          'Swapping it out once data or an error arrives.',
        ],
      },
    } satisfies Guidance,
  },
  decorators: [
    (Story) => (
      <div className="flex h-[280px] w-[360px]">
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
