import { useId, useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Toggle } from './Toggle'

const meta = {
  title: 'Inputs/Toggle',
  component: Toggle,
  args: { label: 'Start at login', isChecked: true, onChange: fn() },
  argTypes: { isChecked: { control: false } },
  render: (args) => <ControlledToggle {...args} />,
} satisfies Meta<typeof Toggle>

export default meta
type Story = StoryObj<typeof meta>

export const On: Story = {}

export const Off: Story = { args: { isChecked: false } }

export const DisabledOn: Story = { args: { isDisabled: true } }

export const DisabledOff: Story = { args: { isChecked: false, isDisabled: true } }

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
function ControlledToggle({ isChecked, onChange, ...args }: ToggleProps): JSX.Element {
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

function SettingRow(args: ToggleProps): JSX.Element {
  const descriptionId = useId()
  return (
    <div className="flex max-w-[360px] items-center justify-between gap-12">
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
