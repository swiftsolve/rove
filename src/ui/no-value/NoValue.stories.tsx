import type { Meta, StoryObj } from '@storybook/react-vite'

import { DataList, DataRow } from '../data-list/DataList'
import { NoValue } from './NoValue'

const meta = {
  title: 'Data display/NoValue',
  component: NoValue,
  args: { label: 'None' },
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
