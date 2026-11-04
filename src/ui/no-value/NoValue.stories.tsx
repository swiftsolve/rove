import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { DataList, DataRow } from '../data-list/DataList'
import { NoValue } from './NoValue'

const meta = {
  title: 'Data display/NoValue',
  component: NoValue,
  args: { label: 'None' },
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'Where a value would be but there’s none: not measured, unknown.',
        'In place of whatever a formatter returned null for.',
        'Any size of line: a data row, a substat, a hero number.',
      ],
      avoid: [
        'A field that may not apply at all: leave the `DataRow`’s value null, and the row isn’t drawn.',
        'A section with nothing to show: use `EmptyState`.',
        'A page still loading: use `LoadingState`.',
        'A zero: it’s a value, so show it.',
      ],
      states: [
        'One look: a short bar in the tertiary colour.',
        'Sized in em, so it scales with its line and sits on its middle.',
        '`label` sets what screen readers hear: “None” by default.',
      ],
      accessibility: {
        builtIn: [
          'The bar is hidden. Screen readers hear `label` in its place.',
          'No dash character, so nothing reads out as “dash”.',
        ],
        yours: [
          'A `label` that says why: “Not measured”, “Unknown”.',
          'A label nearby, like a row’s, that says what’s missing.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof NoValue>

export default meta
type Story = StoryObj<typeof meta>

/** In a line of body text. */
export const Default: Story = {
  render: (args) => (
    <span className="text-sm text-secondary">
      <NoValue {...args} />
    </span>
  ),
}

/** Where it stands in: a data row's value, the speed test's substats and hero number. */
export const InContext: Story = {
  render: () => (
    <div className="flex w-[360px] flex-col gap-16">
      <DataList>
        <DataRow label="Gateway" value="192.168.1.1" />
        <DataRow label="Interface">
          <NoValue />
        </DataRow>
        <DataRow label="MAC" value="A4:C3:F0:01:02:03" />
      </DataList>
      <dl className="grid grid-cols-3 gap-16">
        <div className="flex flex-col gap-4">
          <dt className="type-overline text-tertiary">Ping</dt>
          <dd className="num text-md font-medium text-primary">12.4 ms</dd>
        </div>
        <div className="flex flex-col gap-4">
          <dt className="type-overline text-tertiary">Jitter</dt>
          <dd className="num text-md font-medium text-primary">
            <NoValue label="Not measured" />
          </dd>
        </div>
        <div className="flex flex-col gap-4">
          <dt className="type-overline text-tertiary">Loss</dt>
          <dd className="num text-md font-medium text-primary">0%</dd>
        </div>
      </dl>
      <div className="metric">
        <span className="type-number-display metric-value">
          <NoValue label="No reading" />
        </span>
      </div>
    </div>
  ),
}

/** It scales with the text around it: a data row's value, a substat, a hero number. */
export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-16 text-primary">
      <span className="text-sm">
        <NoValue />
      </span>
      <span className="text-md font-medium">
        <NoValue label="Not measured" />
      </span>
      <span className="type-number-display">
        <NoValue label="Not measured" />
      </span>
    </div>
  ),
}
