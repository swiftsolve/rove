import type { Meta, StoryObj } from '@storybook/react-vite'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { DirectionIcon } from '../icons/DirectionIcon'
import { iconElementControl } from '../icons/icon-options'
import { Readout } from './Readout'

// The direction arrows lead the list: they're what a speed readout carries.
const ICON_CONTROL = iconElementControl(14, {
  'Direction down': <DirectionIcon series="down" />,
  'Direction up': <DirectionIcon series="up" />,
})

const meta = {
  title: 'Data display/Readout',
  component: Readout,
  args: { label: 'Download', icon: 'Direction down', value: '182', unit: 'Mbps' },
  argTypes: { icon: ICON_CONTROL },
  // A term and its description, so it goes in a <dl>.
  render: (args) => (
    <dl>
      <Readout {...args} />
    </dl>
  ),
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A headline figure and its unit: live speed, data used.',
        'With a `label` and `icon` above it, side by side in a `<dl>`.',
        '`compact` for a summary card’s figure, which has no label.',
      ],
      avoid: [
        'A value in a list of facts: use `DataRow`.',
        'A number inside a line of text that eases itself: use `MetricValue`.',
        'A rating at a glance: use `BarMeter`.',
      ],
      accessibility: {
        builtIn: [
          'Labelled, a `<dt>` and `<dd>`: the label and figure read as a pair.',
          'With `spokenValue`, the moving digits are hidden and screen readers hear it instead.',
        ],
        youHandle: [
          'A `<dl>` around labelled readouts.',
          'A `spokenValue` while the figure animates.',
          'Without a label, words nearby that say what the figure is.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof Readout>

export default meta
type Story = StoryObj<typeof meta>

/** Live speed, its direction arrow before the label. */
export const Download: Story = {}

export const Upload: Story = { args: { label: 'Upload', icon: 'Direction up', value: '24.6' } }

export const WithoutIcon: Story = { args: { label: 'Data used', icon: undefined, value: '4.6', unit: 'GB' } }

/** Mid count-up: the digits show 96, a screen reader hears the settled 182 Mbps. */
export const SpokenApart: Story = { args: { value: '96', spokenValue: '182 Mbps' } }

/** No label: the icon sits inline with the figure. */
export const Unlabelled: Story = { args: { label: undefined }, render: (args) => <Readout {...args} /> }

/** A summary card's figure. */
export const Compact: Story = {
  args: {
    label: undefined,
    size: 'compact',
    icon: <DirectionIcon series="down" size={12} />,
    value: '4.6',
    unit: 'GB',
  },
  render: (args) => <Readout {...args} />,
}

/** Labelled readouts in a list, then unlabelled ones at both sizes. */
export const AllStates: Story = {
  render: () => (
    <div className="flex w-[480px] flex-col gap-20">
      <dl className="flex gap-20">
        <Readout
          className="min-w-0 flex-1"
          label="Download"
          icon={<DirectionIcon series="down" />}
          value="182"
          unit="Mbps"
        />
        <Readout
          className="min-w-0 flex-1"
          label="Upload"
          icon={<DirectionIcon series="up" />}
          value="24.6"
          unit="Mbps"
        />
        <Readout className="min-w-0 flex-1" label="Data used" value="4.6" unit="GB" />
      </dl>
      <div className="flex items-baseline gap-20">
        <Readout value="182" unit="Mbps" />
        <Readout size="compact" icon={<DirectionIcon series="down" size={12} />} value="4.6" unit="GB" />
        <Readout size="compact" value="12" unit="ms" />
      </div>
    </div>
  ),
}
