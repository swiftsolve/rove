import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { Badge } from '../badge/Badge'
import { IconButton } from '../button/IconButton'
import { DataList, DataListStack, DataRow } from '../data-list/DataList'
import { ArrowDownIcon, RefreshIcon, RouterIcon, TodayIcon, WifiIcon } from '../icons/Icons'
import { Toggle } from '../toggle/Toggle'
import { Card, CardBody, CardFooter, CardHeader, CardList } from './Card'

const meta = {
  title: 'Containers/Card/Card',
  component: Card,
  subcomponents: { CardHeader, CardBody, CardFooter, CardList },
  args: { as: 'section' },
  argTypes: {
    as: { control: 'inline-radio', options: ['section', 'div', 'li'] },
    onOpen: { control: false },
    children: { control: false },
  },
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A panel of related facts or controls: Wi‑Fi details, DNS, a group of settings.',
        'A summary that opens its own view, with `onOpen`.',
        '`CardBody layout="rows"` for setting rows, `"flush"` for a `DataListStack`.',
        'A `CardFooter` for a footnote or status (“Updated 2 min ago”).',
        '`CardList` for a list that is one card.',
      ],
      avoid: [
        'A message about the whole page, like an error: use `Banner`.',
        'Nothing to show yet: use `EmptyState`.',
        'Details shown only on request: a `Collapsible` inside the card.',
        'A row in a card’s list that opens a view: use `ListRow`.',
      ],
      accessibility: {
        builtIn: [
          'A `section` card is a region named by its header’s title.',
          'Openable: one link over the whole card, named by its title, first in Tab order. Header actions still take their own clicks.',
          'A focus ring just inside the card while its link has keyboard focus.',
          'The header’s icon is hidden from screen readers.',
          '`CardList` is a list, named by its `label`.',
        ],
        yours: [
          'A title that names the card. A `section` needs a `CardHeader`.',
          'A `linkLabel` when the title doesn’t say enough, or there’s no header.',
          'On an openable card, raising your own controls above its link (`relative z-2`).',
          'A `CardList` `label` that names its rows (“Devices”).',
        ],
      },
    } satisfies Guidance,
  },
  // A card's width in the app; All States, two columns of cards, is wider.
  decorators: [
    (Story, { parameters }) => (
      <div className={parameters.isTwoColumns ? 'w-[740px]' : 'w-[360px]'}>
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

/** With `onOpen` the whole card is a link: its header ends in a caret, and it lifts on hover and presses in. */
export const Openable: Story = {
  render: () => <OpenableCard />,
}

const onRefresh = fn()

/** What a click at the middle of `element` lands on, as the browser hit-tests it. */
function hitAt(element: Element): Element | null {
  const box = element.getBoundingClientRect()
  return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
}

/** A click anywhere on the card opens it, while a control in its header still takes its own click. */
export const OpeningAndHeaderAction: Story = {
  tags: ['!autodocs'],
  args: { onOpen: fn() },
  render: (args) => (
    <Card {...args}>
      <CardHeader title="DNS" actions={<IconButton label="Refresh" icon={RefreshIcon} onClick={onRefresh} />} />
      <CardBody>
        <p className="text-sm text-secondary">Lookups answer in 14 ms on average.</p>
      </CardBody>
    </Card>
  ),
  play: async ({ args, canvas, userEvent }) => {
    const link = canvas.getByRole('link', { name: 'DNS' })
    // The link lies over the body, so a click on its text lands on the link.
    const overBody = hitAt(canvas.getByText('Lookups answer in 14 ms on average.'))
    await expect(overBody).toBe(link)
    await userEvent.click(link)
    await expect(args.onOpen).toHaveBeenCalledOnce()

    // The header's control is raised above the link, so it takes its own click.
    const refresh = canvas.getByRole('button', { name: 'Refresh' })
    const overRefresh = hitAt(refresh)
    await expect(overRefresh !== null && refresh.contains(overRefresh)).toBe(true)
    await userEvent.click(refresh)
    await expect(onRefresh).toHaveBeenCalledOnce()
    await expect(args.onOpen).toHaveBeenCalledOnce()
  },
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

function SettingRow({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between gap-12 py-(--row-padding-y) text-sm text-primary">
      {title}
      <Toggle isChecked onChange={fn()} label={title} />
    </div>
  )
}

function RouterCard(props: { as?: 'section' | 'div' | 'li' }) {
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

function OpenableCard() {
  return (
    // The link takes the header's title as its name.
    <Card onOpen={fn()}>
      <CardHeader title="Usage" icon={<TodayIcon size={16} />} />
      <CardBody>
        <span className="inline-flex items-center gap-6 text-md text-primary" aria-hidden>
          <ArrowDownIcon size={12} />
          4.9 GB
        </span>
      </CardBody>
    </Card>
  )
}

/** Every form together. */
export const AllStates: Story = {
  parameters: { isTwoColumns: true },
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
      <OpenableCard />
    </div>
  ),
}
