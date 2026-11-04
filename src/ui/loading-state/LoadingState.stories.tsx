import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { LoadingState } from './LoadingState'

const meta = {
  title: 'Status and feedback/LoadingState',
  component: LoadingState,
  args: { label: 'Loading usage…' },
  // It fills the page's content area, so it gets a box to centre in.
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A page’s first load, before there’s anything to show.',
        'A label for what’s coming, ending in an ellipsis: “Loading usage…”.',
        'It fills the content area and centres itself.',
      ],
      avoid: [
        'Loaded, with nothing to show: use `EmptyState`.',
        'A load that failed: use `Banner`.',
        'A wait inside a dialog or panel: use `Spinner`.',
        'A button’s wait: set `isLoading` on `Button`.',
      ],
      accessibility: {
        builtIn: [
          'A status region (`role="status"`), so the label is announced.',
          'The spinner is silent; the label speaks for it.',
        ],
        yours: [
          'A label that names what’s loading: “Scanning your network…”, not “Loading…”.',
          'Swapping it out once the data or an error arrives.',
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
