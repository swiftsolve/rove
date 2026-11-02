import { Fragment } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { BarMeter } from './BarMeter'

const SIZES = ['xs', 'sm', 'md', 'lg'] as const

// A rating's colour by how many bars it lights.
const COLORS = [
  'var(--text-tertiary)',
  'var(--status-poor)',
  'var(--status-warning)',
  'var(--status-good)',
  'var(--status-positive)',
]

const meta = {
  title: 'Data display/BarMeter',
  component: BarMeter,
  args: { value: 3, size: 'lg', color: 'var(--status-good)' },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 4, step: 1 } },
    size: { control: 'inline-radio', options: SIZES },
    color: { control: 'select', options: COLORS },
  },
} satisfies Meta<typeof BarMeter>

export default meta
type Story = StoryObj<typeof meta>

/** A list row's rating. */
export const Rating: Story = {}

/** Signal strength in a data row. */
export const Signal: Story = { args: { size: 'sm', value: 4, color: 'var(--status-positive)' } }

/** Nothing lit: no rating yet. */
export const Empty: Story = { args: { value: 0, color: 'var(--text-tertiary)' } }

/** A stale rating, waiting on a new test. */
export const Dimmed: Story = { args: { isDimmed: true } }

/** Every size at every value, then dimmed. */
export const AllStates: Story = {
  render: () => (
    // A grid, so each value's column lines up across sizes.
    <div className="grid grid-cols-[repeat(7,max-content)] items-end gap-x-16 gap-y-12">
      {SIZES.map((size) => (
        <Fragment key={size}>
          <span className="w-[24px] text-xs text-tertiary">{size}</span>
          {COLORS.map((color, value) => (
            <BarMeter key={color} value={value} size={size} color={color} />
          ))}
          <BarMeter value={3} size={size} isDimmed />
        </Fragment>
      ))}
    </div>
  ),
}
