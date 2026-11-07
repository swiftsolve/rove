import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { BarMeter } from '../bar-meter/BarMeter'
import { Card, CardBody, CardHeader } from '../card/Card'
import { IconTile } from '../icon-tile/IconTile'
import { CloudGamingIcon } from '../icons/CloudGamingIcon'
import { HdStreamIcon } from '../icons/HdStreamIcon'
import { GamepadIcon, VideoCallIcon } from '../icons/Icons'
import { ListRow } from './ListRow'

function RowText({ title, description }: { title: string; description: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="type-body truncate text-primary">{title}</span>
      <span className="type-body truncate text-tertiary">{description}</span>
    </span>
  )
}

function Rating({
  value,
  color,
  label,
  isDimmed,
}: {
  value: number
  color: string
  label: string
  isDimmed?: boolean
}) {
  return (
    <>
      <BarMeter value={value} color={color} isDimmed={isDimmed} />
      <span className="sr-only">{label}</span>
    </>
  )
}

const meta = {
  title: 'Data display/ListRow',
  component: ListRow,
  args: {
    onClick: fn(),
    children: (
      <>
        <IconTile color="var(--status-positive)" icon={<VideoCallIcon size={17} />} />
        <RowText title="Video calls" description="Zoom, Teams and FaceTime" />
        <Rating value={4} color="var(--status-positive)" label="Excellent" />
      </>
    ),
  },
  argTypes: { children: { control: false } },
  // It sits in a card's list, its hover wash bleeding into the padding.
  render: (args) => (
    <Card className="w-[400px]">
      <CardHeader title="Capabilities" />
      <CardBody>
        <ul role="list" className="flex flex-col">
          <li>
            <ListRow {...args} />
          </li>
        </ul>
      </CardBody>
    </Card>
  ),
  parameters: {
    docs: { subtitle: 'A whole row that opens something, ending in a chevron.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'A card’s row that opens a view, an `IconTile` first if the item has one: a capability, “About Rove”.',
      ],
      whenNotToUse: [
        'A label and value that open nothing: use `DataRow`.',
        'A whole card that opens: use `Card` with `onOpen`.',
        'A row holding a bar or other block content: use `StretchedLink`.',
      ],
      accessibility: {
        builtIn: [
          'A native `<button>` named by its text; the chevron is hidden.',
          'Disabled, it stays focusable and says so (`aria-disabled`), but ignores presses.',
        ],
        toHandle: [
          'A list around the rows: `<ul role="list">`, an `<li>` each.',
          'Words for a meter: an `sr-only` rating (“Excellent”) beside it.',
          'Spans, not divs, inside: a button holds only inline content.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof ListRow>

export default meta
type Story = StoryObj<typeof meta>

/** A capability and its rating, last so it sits on the right. */
export const Default: Story = {}

/** Just the words and the chevron: the About row in Settings. */
export const TextOnly: Story = {
  args: { children: <RowText title="About Rove" description="Version, platform, and source." /> },
}

/** Inert while a test replaces its rating: the whole row faded, a muted tile and dimmed bars, no hover. */
export const Disabled: Story = {
  args: {
    isDisabled: true,
    children: (
      <>
        <IconTile color="neutral" icon={<VideoCallIcon size={17} />} />
        <RowText title="Video calls" description="Zoom, Teams and FaceTime" />
        <Rating value={4} color="var(--status-positive)" label="Excellent" isDimmed />
      </>
    ),
  },
}

/** A click opens it, and so do Enter and Space once it has focus. */
export const Opening: Story = {
  tags: ['!autodocs'],
  play: async ({ args, canvas, userEvent }) => {
    const row = canvas.getByRole('button', { name: /Video calls/ })
    await userEvent.click(row)
    await expect(args.onClick).toHaveBeenCalledOnce()
    await expect(row).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    await expect(args.onClick).toHaveBeenCalledTimes(3)
  },
}

/** Disabled, it stays in the Tab order, announced as disabled, but Enter or a click does nothing. */
export const DisabledStaysInert: Story = {
  tags: ['!autodocs'],
  args: Disabled.args,
  play: async ({ args, canvas, userEvent }) => {
    const row = canvas.getByRole('button', { name: /Video calls/ })
    await userEvent.keyboard('{Tab}')
    await expect(row).toHaveFocus()
    await expect(row).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Enter}')
    await userEvent.click(row)
    await expect(args.onClick).not.toHaveBeenCalled()
  },
}

const CAPABILITIES = [
  {
    title: 'Video calls',
    description: 'Zoom, Teams and FaceTime',
    Icon: VideoCallIcon,
    value: 4,
    color: 'var(--status-positive)',
    label: 'Excellent',
  },
  {
    title: '4K streaming',
    description: 'Netflix and YouTube at 2160p',
    Icon: HdStreamIcon,
    value: 3,
    color: 'var(--status-good)',
    label: 'Good',
  },
  {
    title: 'Online gaming',
    description: 'Low, steady latency',
    Icon: GamepadIcon,
    value: 2,
    color: 'var(--status-warning)',
    label: 'Fair',
  },
  {
    title: 'Cloud gaming',
    description: 'GeForce Now and Xbox Cloud',
    Icon: CloudGamingIcon,
    value: 1,
    color: 'var(--status-poor)',
    label: 'Poor',
  },
] as const

/** A list of rows at each rating, then one disabled. */
export const AllStates: Story = {
  render: () => (
    <Card className="w-[400px]">
      <CardHeader title="Capabilities" />
      <CardBody>
        <ul role="list" className="flex flex-col">
          {CAPABILITIES.map(({ title, description, Icon, value, color, label }) => (
            <li key={title}>
              <ListRow onClick={fn()}>
                <IconTile color={color} icon={<Icon size={17} />} />
                <RowText title={title} description={description} />
                <Rating value={value} color={color} label={label} />
              </ListRow>
            </li>
          ))}
          <li>
            <ListRow onClick={fn()} isDisabled>
              <IconTile color="neutral" icon={<HdStreamIcon size={17} />} />
              <RowText title="HD streaming" description="Testing…" />
              <Rating value={3} color="var(--status-good)" label="Good" isDimmed />
            </ListRow>
          </li>
        </ul>
      </CardBody>
    </Card>
  ),
}
