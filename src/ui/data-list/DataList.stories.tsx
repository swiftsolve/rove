import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { BarMeter } from '../bar-meter/BarMeter'
import { Card, CardBody, CardHeader } from '../card/Card'
import { DataList, DataListStack, DataRow } from './DataList'

const ROWS = (
  <>
    <DataRow label="Download" value="512 Mbps" />
    <DataRow label="Upload" value="48 Mbps" />
    <DataRow label="Latency" value="14 ms" />
    <DataRow label="Signal" align="center">
      <BarMeter value={3} size="sm" color="var(--status-good)" />
      <span className="sr-only">Good</span>
    </DataRow>
  </>
)

const meta = {
  title: 'Data display/DataList',
  component: DataList,
  args: { children: ROWS },
  argTypes: {
    density: { control: 'inline-radio', options: ['default', 'compact'] },
    children: { control: false },
  },
  // It lives in a card's body.
  render: (args) => (
    <Card className="w-[320px]">
      <CardHeader title="Connection" />
      <CardBody>
        <DataList {...args} />
      </CardBody>
    </Card>
  ),
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'Labelled facts in a card: an address, a band, a speed.',
        'Each fact a `DataRow`: its label on the left, its value on the right.',
        '`compact` for a short list, or one repeated down a page.',
        'Several topics in one card: a `DataList` each, in a `DataListStack`.',
        'A row with no value and no children isn’t drawn, so a list can name every field it might have.',
        'A value that isn’t text (a meter, a badge) in the row’s children, with `align="center"`.',
        'A missing value that still needs its row: `NoValue` as the children.',
      ],
      avoid: [
        'A card’s headline figure: use `Readout`.',
        'Rows that open something: use `ListRow`.',
        'A list of items, each its own row: use `CardList`.',
      ],
      accessibility: {
        builtIn: [
          'A `<dl>`: each row a `<dt>` label and a `<dd>` value, read as a pair.',
          'A row with nothing to show leaves no empty pair behind.',
        ],
        youHandle: [
          'Words for a visual value: an `sr-only` word beside a `BarMeter`.',
          'Short labels that name the value: “Gateway”, not “Your gateway’s address”.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof DataList>

export default meta
type Story = StoryObj<typeof meta>

/** Signal's meter has no text baseline, so its row centres it (`align="center"`). */
export const Default: Story = {}

/** A list repeated down a page. */
export const Compact: Story = { args: { density: 'compact' } }

/** A row with no value renders nothing, so a list can name every field it might have. */
export const MissingValue: Story = {
  args: {
    children: (
      <>
        <DataRow label="Address" value="192.168.1.20" />
        <DataRow label="IPv6" value={null} />
        <DataRow label="Gateway" value="192.168.1.1" />
      </>
    ),
  },
}

/** Lists grouped by topic, a hairline between them. */
export const Stack: Story = {
  render: () => (
    <Card className="w-[320px]">
      <CardHeader title="Connection details" />
      <CardBody layout="flush">
        <DataListStack>
          <DataList>
            <DataRow label="Network" value="Home 5G" />
            <DataRow label="Band" value="5 GHz" />
            <DataRow label="Channel" value="36" />
          </DataList>
          <DataList>
            <DataRow label="Address" value="192.168.1.20" />
            <DataRow label="Gateway" value="192.168.1.1" />
            <DataRow label="DNS" value="1.1.1.1" />
          </DataList>
        </DataListStack>
      </CardBody>
    </Card>
  ),
}

/** Every density side by side. */
export const AllStates: Story = {
  render: () => (
    <div className="grid grid-cols-2 items-start gap-12">
      {(['default', 'compact'] as const).map((density) => (
        <Card key={density} className="w-[320px]">
          <CardHeader title={density} />
          <CardBody>
            <DataList density={density}>{ROWS}</DataList>
          </CardBody>
        </Card>
      ))}
    </div>
  ),
}
