import type { Meta, StoryObj } from '@storybook/react-vite'
import { Fragment } from 'react'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
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
  parameters: {
    docs: { subtitle: 'A thin bar split into download and upload, against a shared maximum.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'Download and upload in proportion, in a usage row.',
        'Rows compared with each other, every bar scaled to the busiest row.',
      ],
      whenNotToUse: ['A rating or signal: use `BarMeter`.', 'A single headline amount: use `Readout`.'],
      accessibility: {
        builtIn: ['An image to screen readers (`role="img"`), named by `label`.'],
        toHandle: [
          'A `label` that says both amounts, down then up.',
          'Figures beside it: colour alone doesn’t say which segment is which.',
        ],
      },
    } satisfies Guidance,
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
          <span className="type-caption text-tertiary">{name}</span>
          <SplitBar down={down} up={up} max={MAX} label={`${down} MB down, ${up} MB up`} />
        </Fragment>
      ))}
    </div>
  ),
}
