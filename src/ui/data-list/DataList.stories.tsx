import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { BarMeter } from '../bar-meter/BarMeter'
import { Card } from '../card/Card'
import { CardBody } from '../card/components/CardBody'
import { CardHeader } from '../card/components/CardHeader'
import { DataListStack } from './components/DataListStack'
import { DataRow } from './components/DataRow'
import { DataList } from './DataList'

const ROWS = (
  <>
    <DataRow label="Download" value="512 Mbps" />
    <DataRow label="Upload" value="48 Mbps" />
    <DataRow label="Latency" value="14 ms" />
    <DataRow label="Signal" align="center">
      <BarMeter value={3} color="var(--status-good)" />
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
    docs: { subtitle: 'A list of labelled facts, each a label and its value.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'Labelled facts in a card: “Gateway”, “Band”, “Link speed”.',
        'Facts on several topics in one card: a `DataList` each, in a `DataListStack`.',
        'A fact with no value that keeps its row: `NoValue` as the children.',
      ],
      whenNotToUse: ['A card’s headline figure: use `Readout`.', 'Rows that open something: use `ListRow`.'],
      accessibility: {
        builtIn: [
          'A `<dl>`: each row a `<dt>` label and a `<dd>` value.',
          'An empty row isn’t rendered, so no label is read alone.',
        ],
        toHandle: ['Words for a value that isn’t text, like a meter’s `aria-label`.'],
      },
    } satisfies Guidance,
    partGuidance: {
      DataRow: {
        whenToUse: [
          'One labelled fact in a `DataList`: Gateway.',
          'A value that isn’t text, as `children`: signal bars.',
        ],
        whenNotToUse: ['A row that opens something: use `ListRow`.', 'A card’s headline figure: use `Readout`.'],
        accessibility: {
          builtIn: [
            'A `<dt>` label and a `<dd>` value.',
            'A row with no value isn’t drawn, so no label is read alone.',
          ],
          toHandle: ['Words for a value that isn’t text, like a meter’s `aria-label`.'],
        },
      },
      DataListStack: {
        whenToUse: [
          'Facts on several topics in one card, a `DataList` each.',
          'In a `CardBody` with `layout="flush"`, so its hairlines run edge to edge.',
        ],
        whenNotToUse: ['Facts on one topic: use a single `DataList`.'],
        accessibility: {
          builtIn: ['The hairlines are borders, so nothing extra is read.'],
          toHandle: ['Groups whose first rows say their topic, as no heading names them.'],
        },
      },
    } satisfies Record<string, Guidance>,
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
            <DataRow label="Public IP" value="203.0.113.57" />
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
