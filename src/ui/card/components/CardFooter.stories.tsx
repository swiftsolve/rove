import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../../.storybook/docs-page'
import { DataRow } from '../../data-list/components/DataRow'
import { DataList } from '../../data-list/DataList'
import { Card } from '../Card'
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
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'A footnote under the body: the Router card’s packet-loss note.',
        'The result of an action in the card: Settings’ update check.',
      ],
      whenNotToUse: ['Actions on the card: use `CardHeader`’s `actions`.', 'A failure on the page: use `Banner`.'],
      accessibility: {
        builtIn: ['A plain `<div>` after the body, read last.'],
        toHandle: ['`role="status"` on a footer that appears after an action, so it’s announced.'],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof CardFooter>

export default meta
type Story = StoryObj<typeof meta>

/** A footnote in the band. */
export const Default: Story = {}
