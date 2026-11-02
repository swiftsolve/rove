import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { BarMeter } from '../bar-meter/BarMeter'
import { Card, CardBody, CardHeader } from '../card/Card'
import { IconTile } from '../icon-tile/IconTile'
import { CloudGamingIcon, GamepadIcon, HdStreamIcon, VideoCallIcon } from '../icons/Icons'
import { ListRow } from './ListRow'

function RowText({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="text-body truncate">{title}</span>
      <span className="text-body-small truncate">{description}</span>
    </span>
  )
}

function Rating({ value, color, label, isDimmed }: { value: number; color: string; label: string; isDimmed?: boolean }): JSX.Element {
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
    <Card className="max-w-[400px]">
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
} satisfies Meta<typeof ListRow>

export default meta
type Story = StoryObj<typeof meta>

/** A capability and its rating, last so it sits on the right. */
export const Default: Story = {}

/** Just the words and the chevron: the About row in Settings. */
export const TextOnly: Story = {
  args: { children: <RowText title="About Rove" description="Version, platform, and source." /> },
}

/** Inert while a test replaces its rating: muted tile, dimmed bars, no hover. */
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

const CAPABILITIES = [
  { title: 'Video calls', description: 'Zoom, Teams and FaceTime', Icon: VideoCallIcon, value: 4, color: 'var(--status-positive)', label: 'Excellent' },
  { title: '4K streaming', description: 'Netflix and YouTube at 2160p', Icon: HdStreamIcon, value: 3, color: 'var(--status-good)', label: 'Good' },
  { title: 'Online gaming', description: 'Low, steady latency', Icon: GamepadIcon, value: 2, color: 'var(--status-warning)', label: 'Fair' },
  { title: 'Cloud gaming', description: 'GeForce Now and Xbox Cloud', Icon: CloudGamingIcon, value: 1, color: 'var(--status-poor)', label: 'Poor' },
] as const

/** A list of rows at each rating, then one disabled. */
export const AllStates: Story = {
  render: () => (
    <Card className="max-w-[400px]">
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
