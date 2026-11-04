import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { DotSeparator, InlineMeta } from './DotSeparator'

const meta = {
  title: 'Containers/DotSeparator/DotSeparator',
  component: DotSeparator,
  subcomponents: { InlineMeta },
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'Between inline items on one line: an address, a vendor, a time.',
        '`InlineMeta` for a list of items, some maybe empty.',
        '`shouldTruncate` to keep them on one line.',
        'A bare `DotSeparator` between two items you lay out yourself.',
      ],
      avoid: [
        'Labels and their values: use `DataRow`s in a `DataList`.',
        'A status beside its words: use `StatusDot`.',
        'A missing value that should show: use `NoValue`.',
        'A line between rows: `CardList` and `DataListStack` draw it.',
      ],
      states: [
        'Wrapping, the default: items flow onto the next line.',
        'Truncating: one line, each item ellipsizing as space runs out.',
        'Empty items drop out with their dots. A `0` stays.',
        'One item: no dot. None: nothing.',
      ],
      accessibility: {
        builtIn: ['The dot is hidden from screen readers.', 'A truncated item keeps its full text for screen readers.'],
        yours: [
          'Items that still make sense read in a row, without the dots.',
          'The full value somewhere else when truncation can hide it.',
          'Text colour with enough contrast: it takes its line’s.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof DotSeparator>

export default meta
type Story = StoryObj<typeof meta>

/** A dot between two inline items. */
export const Dot: Story = {
  render: () => (
    <span className="inline-flex items-center gap-6 text-sm text-secondary">
      Wi‑Fi <DotSeparator /> 5 GHz
    </span>
  ),
}

/** Every form together. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-12 text-sm text-secondary">
      <span className="inline-flex items-center gap-6">
        Wi‑Fi <DotSeparator /> 5 GHz
      </span>
      <InlineMeta items={['192.168.1.20', 'Apple', null, '2 min ago']} />
      <InlineMeta items={['Ethernet']} />
      <span className="block w-[160px]">
        <InlineMeta shouldTruncate items={['a-very-long-hostname.local', 'Raspberry Pi Foundation', 'now']} />
      </span>
    </div>
  ),
}
