import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { BarMeter } from './BarMeter'

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
  args: { value: 3, color: 'var(--status-good)' },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 4, step: 1 } },
    color: { control: 'select', options: COLORS },
  },
  parameters: {
    docs: { subtitle: 'Four rising bars, some lit: a rating at a glance.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'Signal strength or a rating, at a glance.',
        'A level in its status colour, taken from the text around it.',
        'A rating not measured yet, `value={0}`: every bar unlit.',
      ],
      whenNotToUse: [
        'An exact figure: use `MetricValue` or `Readout`.',
        'Comparing traffic between rows: use `SplitBar`.',
      ],
      accessibility: {
        handledByComponent: [
          '`aria-hidden`: it’s a picture of the value.',
          'Bars fill with `currentColor`; unlit ones are a faint tint of it.',
        ],
        handledByYourCode: [
          'The value in words: an `sr-only` word or a `role="meter"` wrapper.',
          'A text colour on its container with 3:1 contrast, for the bars.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof BarMeter>

export default meta
type Story = StoryObj<typeof meta>

/** A rating in a data row. */
export const Rating: Story = {}

/** Signal strength in a data row. */
export const Signal: Story = { args: { value: 4, color: 'var(--status-positive)' } }

/** Nothing lit: no rating yet. */
export const Empty: Story = { args: { value: 0, color: 'var(--text-tertiary)' } }

/** A stale rating, waiting on a new test. */
export const Dimmed: Story = { args: { isDimmed: true } }

/** Every value, then dimmed. */
export const AllStates: Story = {
  render: () => (
    <div className="flex items-end gap-16">
      {COLORS.map((color, value) => (
        <BarMeter key={color} value={value} color={color} />
      ))}
      <BarMeter value={3} isDimmed />
    </div>
  ),
}
