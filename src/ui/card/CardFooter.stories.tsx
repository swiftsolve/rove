import type { Meta, StoryObj } from '@storybook/react-vite'

import { DataList, DataRow } from '../data-list/DataList'
import { Card } from './Card'
import { CardBody } from './CardBody'
import { CardFooter } from './CardFooter'
import { CardHeader } from './CardHeader'

const meta = {
  title: 'Containers/Card/CardFooter',
  component: CardFooter,
  args: { children: 'Updated 2 min ago' },
  // A footer is the sunken band at the bottom of a Card.
  render: (args) => (
    <div className="w-[360px]">
      <Card>
        <CardHeader title="Wi‑Fi" />
        <CardBody>
          <DataList>
            <DataRow label="Address" value="192.168.1.20" />
          </DataList>
        </CardBody>
        <CardFooter>
          <span className="type-caption text-tertiary">{args.children}</span>
        </CardFooter>
      </Card>
    </div>
  ),
} satisfies Meta<typeof CardFooter>

export default meta
type Story = StoryObj<typeof meta>

/** A footnote in the band. */
export const Default: Story = {}
