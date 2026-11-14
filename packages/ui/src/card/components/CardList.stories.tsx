import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { CardList } from './CardList'

const meta = {
  title: 'Containers/Card/CardList',
  component: CardList,
  args: { label: 'Devices' },
  argTypes: { children: { control: false } },
  render: (args) => (
    <div className="w-[360px]">
      <CardList {...args}>
        {['MacBook Pro', 'Living room TV', 'Pixel 8'].map((name) => (
          <li key={name} className="type-body px-12 py-10 text-primary">
            {name}
          </li>
        ))}
      </CardList>
    </div>
  ),
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: ['A list that is one card: the tracked services.'],
      whenNotToUse: [
        'Rows under a card’s title: use `CardBody` with `layout="rows"`.',
        'Labelled facts: use `DataList`.',
      ],
      accessibility: {
        builtIn: [
          'A list named by `label`.',
          'Up and Down move between the rows’ controls, and Home and End to the ends.',
        ],
        toHandle: ['A `label` that names the list: “Tracked services”.', 'Each row as an `<li>`.'],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof CardList>

export default meta
type Story = StoryObj<typeof meta>

/** A list that is one card, with a hairline between its rows. */
export const Default: Story = {}
