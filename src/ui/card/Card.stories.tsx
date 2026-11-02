import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Badge } from '../badge/Badge'
import { IconButton } from '../button/IconButton'
import { DataList, DataRow } from '../data-list/DataList'
import { RefreshIcon, WifiIcon } from '../icons/Icons'
import { Card, CardBody, CardFooter, CardHeader, CardList } from './Card'

const meta = {
  title: 'Containers/Card',
  component: Card,
  subcomponents: { CardHeader, CardBody, CardFooter, CardList },
  args: { as: 'section' },
  argTypes: {
    as: { control: 'inline-radio', options: ['section', 'div', 'li'] },
    children: { control: false },
  },
  decorators: [
    (Story) => (
      <div className="w-[360px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

/** A header with an icon and a badge, a body and a footer band. */
export const WithEverything: Story = {
  render: (args) => (
    <Card {...args}>
      <CardHeader title="Wi‑Fi" icon={<WifiIcon size={16} />} actions={<Badge tone="warning">VPN</Badge>} />
      <CardBody>
        <DataList>
          <DataRow label="Address" value="192.168.1.20" />
          <DataRow label="Gateway" value="192.168.1.1" />
        </DataList>
      </CardBody>
      <CardFooter>
        <span className="text-xs text-tertiary">Updated 2 min ago</span>
      </CardFooter>
    </Card>
  ),
}

/** A control at the end of the header; the row keeps its 44px height. */
export const HeaderActions: Story = {
  render: (args) => (
    <Card {...args}>
      <CardHeader title="DNS" actions={<IconButton label="Refresh" icon={RefreshIcon} onClick={fn()} />} />
      <CardBody>
        <p className="text-sm text-secondary">Lookups answer in 14 ms on average.</p>
      </CardBody>
    </Card>
  ),
}

/** CardList: a list that is one card, with a hairline between its rows. */
export const List: Story = {
  render: () => (
    <CardList label="Devices">
      {['MacBook Pro', 'Living room TV', 'Pixel 8'].map((name) => (
        <li key={name} className="px-12 py-10 text-sm text-primary">
          {name}
        </li>
      ))}
    </CardList>
  ),
}

/** Every form together. */
export const AllStates: Story = {
  decorators: [
    (Story) => (
      <div className="w-[740px]">
        <Story />
      </div>
    ),
  ],
  render: () => (
    // Each card at its own height, not stretched to its row's tallest.
    <div className="grid grid-cols-2 items-start gap-12">
      <Card>
        <CardHeader title="Wi‑Fi" icon={<WifiIcon size={16} />} actions={<Badge tone="warning">VPN</Badge>} />
        <CardBody>
          <DataList>
            <DataRow label="Address" value="192.168.1.20" />
            <DataRow label="Gateway" value="192.168.1.1" />
          </DataList>
        </CardBody>
        <CardFooter>
          <span className="text-xs text-tertiary">Updated 2 min ago</span>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader title="DNS" actions={<IconButton label="Refresh" icon={RefreshIcon} />} />
        <CardBody>
          <p className="text-sm text-secondary">Lookups answer in 14 ms on average.</p>
        </CardBody>
      </Card>
      <CardList label="Devices">
        {['MacBook Pro', 'Living room TV', 'Pixel 8'].map((name) => (
          <li key={name} className="px-12 py-10 text-sm text-primary">
            {name}
          </li>
        ))}
      </CardList>
    </div>
  ),
}
