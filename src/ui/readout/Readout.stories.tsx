import type { Meta, StoryObj } from '@storybook/react-vite'
import { DirectionIcon } from '../icons/DirectionIcon'
import { Readout, ReadoutValue } from './Readout'

const meta = {
  title: 'Data display/Readout',
  component: Readout,
  args: { label: 'Download', icon: <DirectionIcon series="down" />, value: '182', unit: 'Mbps' },
  argTypes: { icon: { control: false } },
  // A term and its description, so it goes in a <dl>.
  render: (args) => (
    <dl>
      <Readout {...args} />
    </dl>
  ),
} satisfies Meta<typeof Readout>

export default meta
type Story = StoryObj<typeof meta>

/** Live speed, its direction arrow before the label. */
export const Download: Story = {}

export const Upload: Story = { args: { label: 'Upload', icon: <DirectionIcon series="up" />, value: '24.6' } }

export const WithoutIcon: Story = { args: { label: 'Data used', icon: undefined, value: '4.6', unit: 'GB' } }

/** Mid count-up: the digits show 96, a screen reader hears the settled 182 Mbps. */
export const SpokenApart: Story = { args: { value: '96', spokenValue: '182 Mbps' } }

/** The figure alone, at a readout's size. */
export const Value: Story = { render: () => <ReadoutValue value="182" unit="Mbps" /> }

/** The figure on a summary card. */
export const CompactValue: Story = { render: () => <ReadoutValue size="compact" value="4.6" unit="GB" /> }

/** A download and upload pair, then the bare figure at both sizes. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-20">
      <dl className="flex gap-20">
        <Readout className="min-w-0 flex-1" label="Download" icon={<DirectionIcon series="down" />} value="182" unit="Mbps" />
        <Readout className="min-w-0 flex-1" label="Upload" icon={<DirectionIcon series="up" />} value="24.6" unit="Mbps" />
        <Readout className="min-w-0 flex-1" label="Data used" value="4.6" unit="GB" />
      </dl>
      <div className="flex items-baseline gap-20">
        <ReadoutValue value="182" unit="Mbps" />
        <ReadoutValue size="compact" value="4.6" unit="GB" />
      </div>
    </div>
  ),
}
