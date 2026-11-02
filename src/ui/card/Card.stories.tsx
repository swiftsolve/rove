import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Badge } from '../badge/Badge'
import { IconButton } from '../button/IconButton'
import { DataList, DataListStack, DataRow } from '../data-list/DataList'
import { ChevronRightIcon, RefreshIcon, RouterIcon, WifiIcon } from '../icons/Icons'
import { StretchedLink } from '../link/StretchedLink'
import { Toggle } from '../toggle/Toggle'
import { Card, CardBody, CardFooter, CardHeader, CardList } from './Card'

const meta = {
  title: 'Containers/Card',
  component: Card,
  subcomponents: { CardHeader, CardBody, CardFooter, CardList },
  args: { as: 'section', isInteractive: false },
  argTypes: {
    as: { control: 'inline-radio', options: ['section', 'div', 'li'] },
    isInteractive: { control: 'boolean' },
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
      <CardHeader title="Wi‑Fi" icon={<WifiIcon size={16} />} actions={<Badge tone="positive">VPN</Badge>} />
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

/** Rows that carry their own vertical padding sit in a `rows` body; a footer below gets 12px of air. */
export const RowsBody: Story = {
  render: (args) => (
    <Card {...args}>
      <CardHeader title="Updates" />
      <CardBody layout="rows">
        <SettingRow title="Check automatically" />
        <SettingRow title="Include betas" />
      </CardBody>
      <CardFooter>
        <span className="text-xs text-tertiary">You're up to date.</span>
      </CardFooter>
    </Card>
  ),
}

/** A `flush` body for a DataListStack, whose hairlines run to the card's sides. */
export const FlushBody: Story = {
  render: (args) => <RouterCard {...args} />,
}

/** The whole card opens something: it lifts on hover and presses in. */
export const Interactive: Story = {
  args: { as: 'div', isInteractive: true },
  render: (args) => <InteractiveCard {...args} />,
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

function SettingRow({ title }: { title: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-12 py-(--row-padding-y) text-sm text-primary">
      {title}
      <Toggle isChecked onChange={fn()} label={title} />
    </div>
  )
}

function RouterCard(props: { as?: 'section' | 'div' | 'li' }): JSX.Element {
  return (
    <Card {...props}>
      <CardHeader title="Router" icon={<RouterIcon size={16} />} />
      <CardBody layout="flush">
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
      </CardBody>
    </Card>
  )
}

function InteractiveCard(props: { as?: 'section' | 'div' | 'li' }): JSX.Element {
  return (
    <Card {...props} isInteractive aria-label="Devices">
      <div className="flex items-center gap-8 p-(--card-body-padding)">
        <h2 className="text-heading-small">Devices</h2>
        <ChevronRightIcon size={16} className="ml-auto text-tertiary group-hover/card:text-secondary" />
      </div>
      <StretchedLink label="Open devices" onClick={fn()} />
    </Card>
  )
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
        <CardHeader title="Wi‑Fi" icon={<WifiIcon size={16} />} actions={<Badge tone="positive">VPN</Badge>} />
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
      <Card>
        <CardHeader title="Updates" />
        <CardBody layout="rows">
          <SettingRow title="Check automatically" />
          <SettingRow title="Include betas" />
        </CardBody>
        <CardFooter>
          <span className="text-xs text-tertiary">You're up to date.</span>
        </CardFooter>
      </Card>
      <RouterCard />
      <InteractiveCard as="div" />
    </div>
  ),
}
