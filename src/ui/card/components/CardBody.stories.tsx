import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { DataListStack } from '../../data-list/components/DataListStack'
import { DataRow } from '../../data-list/components/DataRow'
import { DataList } from '../../data-list/DataList'
import { Toggle } from '../../toggle/Toggle'
import { Card } from '../Card'
import { CardBody } from './CardBody'
import { CardFooter } from './CardFooter'
import { CardHeader } from './CardHeader'

const CONTENT = {
  default: (
    <DataList>
      <DataRow label="Address" value="192.168.1.20" />
      <DataRow label="Gateway" value="192.168.1.1" />
    </DataList>
  ),
  rows: (
    <>
      {['Check automatically', 'Include betas'].map((title) => (
        <div
          key={title}
          className="type-body flex items-center justify-between gap-12 py-(--row-padding-y) text-primary"
        >
          {title}
          <Toggle isChecked onChange={fn()} label={title} />
        </div>
      ))}
    </>
  ),
  flush: (
    <DataListStack>
      <DataList density="compact">
        <DataRow label="Latency" value="4 ms" />
        <DataRow label="Jitter" value="1 ms" />
      </DataList>
      <DataList density="compact">
        <DataRow label="Gateway" value="192.168.1.1" />
        <DataRow label="Interface" value="en0" />
      </DataList>
    </DataListStack>
  ),
}

const meta = {
  title: 'Containers/Card/CardBody',
  component: CardBody,
  args: { layout: 'default', children: null },
  argTypes: {
    layout: { control: 'inline-radio', options: ['default', 'rows', 'flush'] },
    children: { control: false },
  },
  // Each layout with the content it's for, under a header and above a footer.
  render: ({ layout = 'default' }) => (
    <div className="w-[360px]">
      <Card>
        <CardHeader title="Router" />
        <CardBody layout={layout}>{CONTENT[layout]}</CardBody>
        <CardFooter>
          <span className="type-caption text-tertiary">Updated 2 min ago</span>
        </CardFooter>
      </Card>
    </div>
  ),
} satisfies Meta<typeof CardBody>

export default meta
type Story = StoryObj<typeof meta>

/** Padded all round. */
export const Default: Story = {}

/** Rows that carry their own vertical padding: none above them, 12px above a footer. */
export const Rows: Story = { args: { layout: 'rows' } }

/** A DataListStack, its hairlines running to the card's sides. */
export const Flush: Story = { args: { layout: 'flush' } }
