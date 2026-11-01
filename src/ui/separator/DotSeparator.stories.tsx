import type { Meta, StoryObj } from '@storybook/react-vite'
import { DotSeparator, InlineMeta } from './DotSeparator'

const meta = {
  title: 'Containers/DotSeparator',
  component: DotSeparator,
  subcomponents: { InlineMeta },
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

/** InlineMeta puts a dot between its items and drops the empty ones. */
export const InlineMetaItems: Story = {
  render: () => (
    <span className="text-sm text-secondary">
      <InlineMeta items={['192.168.1.20', 'Apple', null, '2 min ago']} />
    </span>
  ),
}

/** One line, each item ellipsizing as space runs out. */
export const Truncated: Story = {
  render: () => (
    <span className="block w-[160px] text-sm text-secondary">
      <InlineMeta shouldTruncate items={['a-very-long-hostname.local', 'Raspberry Pi Foundation', 'now']} />
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
