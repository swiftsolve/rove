import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { TextField, TextFieldAction } from './TextField'

const onTest = fn()

const meta = {
  title: 'Inputs/TextField',
  component: TextField,
  args: { label: 'Address', value: '', onChange: fn(), placeholder: 'example.com or 192.168.1.1' },
  argTypes: {
    value: { control: false },
    action: { control: false },
    feedback: { control: 'text' },
  },
  render: (args) => <ControlledTextField {...args} />,
  decorators: [
    (Story) => (
      <div className="w-[320px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TextField>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}

export const Filled: Story = { args: { value: 'example.com' } }

/** A hint under the field, announced as it changes. */
export const WithFeedback: Story = { args: { feedback: 'Tested when you add it.' } }

/** The value failed to parse: a red border, and the reason under it. */
export const Invalid: Story = { args: { value: 'not an address', isInvalid: true, feedback: 'Not an address.' } }

/** A Test button inside the border, off until there's an address. */
export const WithAction: Story = {
  args: { feedback: 'Tested when you add it.' },
  render: (args) => <AddressField {...args} />,
}

/** Test does nothing until there's an address; typing one turns it on. */
export const TypingTurnsOnTest: Story = {
  tags: ['!autodocs'],
  render: (args) => <AddressField {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const test = canvas.getByRole('button', { name: 'Test' })
    await userEvent.click(test)
    await expect(onTest).not.toHaveBeenCalled()
    await userEvent.type(canvas.getByRole('textbox', { name: 'Address' }), 'example.com')
    await expect(args.onChange).toHaveBeenLastCalledWith('example.com')
    await expect(test).not.toHaveAttribute('aria-disabled')
    await userEvent.click(test)
    await expect(onTest).toHaveBeenCalledOnce()
  },
}

/** The action while it runs: only a spinner, named for screen readers. */
export const ActionLoading: Story = {
  args: {
    value: 'example.com',
    action: (
      <TextFieldAction onClick={onTest} isLoading loadingLabel="Testing">
        Test
      </TextFieldAction>
    ),
  },
}

/** Every state together. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-16">
      <TextField label="Empty" value="" onChange={() => {}} placeholder="example.com or 192.168.1.1" />
      <TextField label="Filled" value="example.com" onChange={() => {}} feedback="Tested when you add it." />
      <TextField label="Invalid" value="not an address" onChange={() => {}} isInvalid feedback="Not an address." />
      <TextField
        label="Action"
        value=""
        onChange={() => {}}
        placeholder="example.com or 192.168.1.1"
        action={
          <TextFieldAction onClick={() => {}} isDisabled>
            Test
          </TextFieldAction>
        }
      />
      <TextField
        label="Action loading"
        value="example.com"
        onChange={() => {}}
        action={
          <TextFieldAction onClick={() => {}} isLoading loadingLabel="Testing">
            Test
          </TextFieldAction>
        }
      />
      <TextField
        label="Action invalid"
        value="not an address"
        onChange={() => {}}
        isInvalid
        feedback="Not an address."
        action={<TextFieldAction onClick={() => {}}>Test</TextFieldAction>}
      />
    </div>
  ),
}

type TextFieldProps = ComponentProps<typeof TextField>

/** Holds the value, so typing works in the canvas. */
function ControlledTextField({ value, onChange, ...args }: TextFieldProps) {
  const [text, setText] = useState(value)
  return (
    <TextField
      {...args}
      value={text}
      onChange={(next) => {
        setText(next)
        onChange(next)
      }}
    />
  )
}

/** The Add service field: Test turns on once there's an address. */
function AddressField({ value, onChange, ...args }: TextFieldProps) {
  const [address, setAddress] = useState(value)
  return (
    <TextField
      {...args}
      value={address}
      onChange={(next) => {
        setAddress(next)
        onChange(next)
      }}
      action={
        <TextFieldAction onClick={onTest} isDisabled={!address}>
          Test
        </TextFieldAction>
      }
    />
  )
}
