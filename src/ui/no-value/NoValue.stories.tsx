import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { DataRow } from '../data-list/components/DataRow'
import { DataList } from '../data-list/DataList'
import { NoValue } from './NoValue'

const meta = {
  title: 'Data display/NoValue',
  component: NoValue,
  args: { label: 'None' },
  parameters: {
    docs: { subtitle: 'A short drawn bar where a value is missing.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'Where a value would be but there’s none, in place of a dash or “N/A”: not measured, unknown.',
        'A value the formatter returns as null: `?? <NoValue />`.',
      ],
      whenNotToUse: [
        'A field that may not apply: use `DataRow` with a null value.',
        'A section with nothing to show: use `EmptyState`.',
        'A page still loading: use `LoadingState`.',
      ],
      accessibility: {
        builtIn: [
          'The bar is `aria-hidden`; screen readers hear `label` instead.',
          'A drawn bar, not a dash, so nothing reads as “dash”.',
        ],
        toHandle: [
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
    <span className="type-body text-secondary">
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
          <dt className="type-body-medium text-tertiary">Ping</dt>
          <dd className="type-body num leading-body text-primary">12.4 ms</dd>
        </div>
        <div className="flex flex-col gap-4">
          <dt className="type-body-medium text-tertiary">Jitter</dt>
          <dd className="type-body num leading-body text-primary">
            <NoValue label="Not measured" />
          </dd>
        </div>
        <div className="flex flex-col gap-4">
          <dt className="type-body-medium text-tertiary">Loss</dt>
          <dd className="type-body num leading-body text-primary">0%</dd>
        </div>
      </dl>
      <div className="metric">
        <span className="type-display metric-value">
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
      <span className="type-body">
        <NoValue />
      </span>
      <span className="type-body leading-body">
        <NoValue label="Not measured" />
      </span>
      <span className="type-display">
        <NoValue label="Not measured" />
      </span>
    </div>
  ),
}
