import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ComputerIcon, MoonIcon, SunIcon } from '../icons/Icons'
import { SegmentedControl, type SegmentedOption } from './SegmentedControl'

const THEME_OPTIONS: SegmentedOption<string>[] = [
  { value: 'dark', label: 'Dark', icon: <MoonIcon size={15} className="shrink-0" /> },
  { value: 'light', label: 'Light', icon: <SunIcon size={15} className="shrink-0" /> },
  { value: 'system', label: 'System', icon: <ComputerIcon size={15} className="shrink-0" /> },
]

const RANGE_OPTIONS: SegmentedOption<string>[] = [
  { value: 'hour', label: 'Hour' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
]

const meta = {
  title: 'Inputs/SegmentedControl',
  component: SegmentedControl,
  args: { options: THEME_OPTIONS, value: 'dark', onChange: fn(), 'aria-label': 'Theme' },
  argTypes: {
    options: { control: false },
    value: { control: false },
  },
  render: (args) => <ControlledSegmentedControl {...args} />,
} satisfies Meta<typeof SegmentedControl>

export default meta
type Story = StoryObj<typeof meta>

/** The theme picker in Settings. */
export const WithIcons: Story = {}

export const TextOnly: Story = { args: { options: RANGE_OPTIONS, value: 'day', 'aria-label': 'Time range' } }

/** Two options. */
export const TwoOptions: Story = {
  args: {
    options: [
      { value: 'down', label: 'Download' },
      { value: 'up', label: 'Upload' },
    ],
    value: 'down',
    'aria-label': 'Direction',
  },
}

type SegmentedControlProps = ComponentProps<typeof SegmentedControl<string>>

/** Holds the choice, so the segments switch in the canvas. */
function ControlledSegmentedControl({ value, onChange, ...args }: SegmentedControlProps): JSX.Element {
  const [choice, setChoice] = useState(value)
  return (
    <SegmentedControl
      {...args}
      value={choice}
      onChange={(next) => {
        setChoice(next)
        onChange(next)
      }}
    />
  )
}
