import { Fragment } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SplitBar } from './SplitBar'

// Rows of one list, every bar scaled against the busiest row's total.
const ROWS = [
  { name: 'Busiest', down: 840, up: 160 },
  { name: 'Mostly up', down: 90, up: 410 },
  { name: 'Down only', down: 250, up: 0 },
  { name: 'Quiet', down: 20, up: 10 },
  { name: 'Idle', down: 0, up: 0 },
]
const MAX = 1000

const meta = {
  title: 'Data display/SplitBar',
  component: SplitBar,
  args: { down: 620, up: 180, max: MAX, label: '620 MB down, 180 MB up', className: 'w-[320px]' },
  argTypes: {
    down: { control: { type: 'range', min: 0, max: MAX, step: 10 } },
    up: { control: { type: 'range', min: 0, max: MAX, step: 10 } },
  },
} satisfies Meta<typeof SplitBar>

export default meta
type Story = StoryObj<typeof meta>

/** A usage row's bar: download, then upload, against the list's busiest row. */
export const Default: Story = {}

/** Nothing moved yet: just the empty track. */
export const Empty: Story = { args: { down: 0, up: 0, label: 'Nothing transferred' } }

/** A list's bars, scaled to one max so they compare at a glance. */
export const AllStates: Story = {
  render: () => (
    // A grid, so the bars start in one column whatever the name's width.
    <div className="grid grid-cols-[max-content_320px] items-center gap-x-16 gap-y-12">
      {ROWS.map(({ name, down, up }) => (
        <Fragment key={name}>
          <span className="text-xs text-tertiary">{name}</span>
          <SplitBar down={down} up={up} max={MAX} label={`${down} MB down, ${up} MB up`} />
        </Fragment>
      ))}
    </div>
  ),
}
