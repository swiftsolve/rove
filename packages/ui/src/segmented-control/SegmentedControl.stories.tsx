import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ComponentProps, useState } from 'react'
import { expect, fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../.storybook/docs-page'
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
  args: { options: THEME_OPTIONS, value: 'dark', onChange: fn(), label: 'Theme' },
  argTypes: {
    options: { control: false },
    value: { control: false },
  },
  parameters: {
    docs: { subtitle: 'A row of a few options side by side, one chosen at a time.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'Picking one of a few exclusive options, like Settings’ Theme.',
        'A choice whose options all fit in view, each a word or two.',
        'A choice that applies at once, with no save.',
      ],
      whenNotToUse: ['Turning one setting on or off: use `Toggle`.', 'Running an action: use `Button`.'],
      accessibility: {
        builtIn: [
          'A radio group, each segment a radio on a native `<button>`.',
          'One Tab stop. The arrow keys move and choose.',
          'Each segment is named by its label. The thumb is hidden.',
        ],
        toHandle: [
          'A name for the group: `label`, or `aria-labelledby` at a title.',
          '`aria-describedby` pointing at the row’s description, when it has one.',
        ],
      },
    } satisfies Guidance,
  },
  render: (args) => <ControlledSegmentedControl {...args} />,
} satisfies Meta<typeof SegmentedControl>

export default meta
type Story = StoryObj<typeof meta>

/** The theme picker in Settings. */
export const WithIcons: Story = {}

export const TextOnly: Story = { args: { options: RANGE_OPTIONS, value: 'day', label: 'Time range' } }

/** Two options. */
export const TwoOptions: Story = {
  args: {
    options: [
      { value: 'down', label: 'Download' },
      { value: 'up', label: 'Upload' },
    ],
    value: 'down',
    label: 'Direction',
  },
}

/** A click picks a segment; the arrow keys move to the next one and pick it. */
export const Choosing: Story = {
  tags: ['!autodocs'],
  play: async ({ args, canvas, userEvent }) => {
    const light = canvas.getByRole('radio', { name: 'Light' })
    await userEvent.click(light)
    await expect(light).toBeChecked()
    await expect(args.onChange).toHaveBeenLastCalledWith('light')
    await userEvent.keyboard('{ArrowRight}')
    const system = canvas.getByRole('radio', { name: 'System' })
    await expect(system).toHaveFocus()
    await expect(system).toBeChecked()
    await expect(args.onChange).toHaveBeenLastCalledWith('system')
  },
}

type SegmentedControlProps = ComponentProps<typeof SegmentedControl<string>>

/** Holds the choice, so the segments switch in the canvas. */
function ControlledSegmentedControl({ value, onChange, ...args }: SegmentedControlProps) {
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
