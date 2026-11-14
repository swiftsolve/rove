import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../.storybook/docs-page'
import { DotSeparator, InlineMeta } from './DotSeparator'

const meta = {
  title: 'Containers/DotSeparator/DotSeparator',
  component: DotSeparator,
  subcomponents: { InlineMeta },
  parameters: {
    docs: { subtitle: 'A small dot between items on one line.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'Short facts on one line, like a device’s vendor and model, in place of a typed dot.',
        'Facts that may be empty, in `InlineMeta`: they drop out with their dots.',
        'Parts you lay out yourself, a bare `DotSeparator` between them: the Services header.',
      ],
      whenNotToUse: [
        'Labels with their values: use `DataRow`s.',
        'A status beside its words: use `StatusDot`.',
        'A missing value that should show: use `NoValue`.',
      ],
      accessibility: {
        builtIn: ['The dot is hidden from screen readers.', 'A truncated item keeps its full text for screen readers.'],
        toHandle: [
          'Items that read well in a row, without the dots.',
          'The full value elsewhere when truncation can cut it off.',
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
    <span className="type-body inline-flex items-center gap-6 text-secondary">
      Wi‑Fi <DotSeparator /> 5 GHz
    </span>
  ),
}

/** Every form together. */
export const AllStates: Story = {
  render: () => (
    <div className="type-body flex flex-col items-start gap-12 text-secondary">
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
