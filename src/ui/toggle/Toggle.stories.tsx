import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ComponentProps, useId, useState } from 'react'
import { expect, fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { Toggle } from './Toggle'

const meta = {
  title: 'Inputs/Toggle',
  component: Toggle,
  args: { label: 'Start at login', isChecked: true, onChange: fn() },
  argTypes: { isChecked: { control: false } },
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A setting that’s on or off, in a setting row.',
        'A change that applies at once, with no save.',
        'Beside the setting’s title and description, which explain it.',
      ],
      avoid: [
        'Picking one of a few options: use `SegmentedControl`.',
        'An action that runs once, like Check now: use `Button`.',
        'A status the user can’t change: use `Badge` or `StatusDot`.',
      ],
      states: [
        'On: an accent track, the knob to the right.',
        'Off: an inset track, the knob to the left.',
        'Flipping slides the knob across.',
        '`isDisabled` dims it, on or off.',
      ],
      accessibility: {
        builtIn: [
          'A native `<button>` with `role="switch"`: a click or Space flips it.',
          'Screen readers hear whether it’s on.',
          'A focus ring on keyboard focus.',
          'Disabled stays focusable, so a tooltip can say why. It ignores every flip and tells screen readers (`aria-disabled`).',
          'With reduced motion, the knob jumps instead of sliding.',
        ],
        yours: [
          'A `label` naming the setting, as the row’s title does. The switch shows no text.',
          '`aria-describedby` pointing at the row’s description.',
          'On a disabled switch, a tooltip that says why.',
        ],
      },
    } satisfies Guidance,
  },
  render: (args) => <ControlledToggle {...args} />,
} satisfies Meta<typeof Toggle>

export default meta
type Story = StoryObj<typeof meta>

export const On: Story = {}

export const Off: Story = { args: { isChecked: false } }

export const DisabledOn: Story = { args: { isDisabled: true } }

export const DisabledOff: Story = {
  args: { isChecked: false, isDisabled: true },
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole('switch', { name: 'Start at login' })
    await userEvent.click(toggle)
    await expect(toggle).not.toBeChecked()
    await expect(args.onChange).not.toHaveBeenCalled()
  },
}

/** A click flips it, and so does Space once it has focus. */
export const Flipping: Story = {
  args: { isChecked: false },
  tags: ['!autodocs'],
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole('switch', { name: 'Start at login' })
    await userEvent.click(toggle)
    await expect(toggle).toBeChecked()
    await expect(args.onChange).toHaveBeenLastCalledWith(true)
    await userEvent.keyboard(' ')
    await expect(toggle).not.toBeChecked()
    await expect(args.onChange).toHaveBeenLastCalledWith(false)
  },
}

/** In a setting row: the text beside it explains the setting. */
export const InSettingRow: Story = {
  args: { label: 'Notify when a service goes down', isChecked: false },
  render: (args) => <SettingRow {...args} />,
}

/** Every state together. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-12">
      <Toggle isChecked label="On" onChange={() => {}} />
      <Toggle isChecked={false} label="Off" onChange={() => {}} />
      <Toggle isChecked label="Disabled on" isDisabled onChange={() => {}} />
      <Toggle isChecked={false} label="Disabled off" isDisabled onChange={() => {}} />
    </div>
  ),
}

type ToggleProps = ComponentProps<typeof Toggle>

/** Holds the state, so the switch flips in the canvas. */
function ControlledToggle({ isChecked, onChange, ...args }: ToggleProps) {
  const [isOn, setIsOn] = useState(isChecked)
  return (
    <Toggle
      {...args}
      isChecked={isOn}
      onChange={(isNowOn) => {
        setIsOn(isNowOn)
        onChange(isNowOn)
      }}
    />
  )
}

function SettingRow(args: ToggleProps) {
  const descriptionId = useId()
  return (
    <div className="flex w-[360px] items-center justify-between gap-12">
      <div className="flex min-w-0 flex-col gap-4">
        <span className="text-md font-medium text-primary">Service alerts</span>
        <span id={descriptionId} className="text-xs leading-caption text-tertiary">
          A notification when a service stops answering.
        </span>
      </div>
      <ControlledToggle {...args} aria-describedby={descriptionId} />
    </div>
  )
}
