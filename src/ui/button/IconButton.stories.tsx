import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { iconArg, iconComponentControl } from '../icons/icon-options'
import { CloseIcon, MoreVerticalIcon, PlayIcon, RefreshIcon } from '../icons/Icons'
import { IconButton } from './IconButton'

const meta = {
  title: 'Actions/IconButton',
  component: IconButton,
  args: { label: 'Refresh', icon: iconArg('RefreshIcon'), onClick: fn() },
  argTypes: {
    variant: { control: 'inline-radio', options: ['soft', 'ghost'] },
    iconSize: { control: 'inline-radio', options: [16, 14] },
    tooltipSide: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] },
    icon: iconComponentControl,
  },
  parameters: {
    docs: { subtitle: 'A square button with an icon instead of words, named by its tooltip.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'An action an icon says on its own, like Refresh.',
        'A help button, with the hint in `tooltip`.',
        'An action where a chip is too heavy, `variant="ghost"`: a `Dialog`’s close.',
      ],
      whenNotToUse: [
        'An action that needs words: use `Button`.',
        'Several actions behind one icon: use `Menu`.',
        'An item’s tile that opens it: use `IconTileButton`.',
      ],
      accessibility: {
        builtIn: [
          'A native `<button>`, named by `label`. The icon is hidden.',
          'Shows `label` as a tooltip on hover and keyboard focus.',
          'A longer `tooltip` is read as its description.',
          'Disabled and loading stay focusable and ignore presses.',
        ],
        toHandle: [
          'A `label` that says what happens, like “Close”.',
          'An icon that means that action at a glance.',
          'On a disabled button, a `tooltip` that says why.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof IconButton>

export default meta
type Story = StoryObj<typeof meta>

/** A neutral inset chip: refresh, help, share. */
export const Default: Story = {}

/** No fill until hovered: a dialog's close. */
export const Ghost: Story = { args: { label: 'Close', icon: iconArg('CloseIcon'), variant: 'ghost' } }

/** An icon that reads large at 16 drops to 14. */
export const SmallIcon: Story = { args: { label: 'Run', icon: iconArg('PlayIcon'), iconSize: 14 } }

/** The tooltip says more than the label. */
export const WithHint: Story = {
  args: {
    label: 'Help',
    icon: iconArg('HelpIcon'),
    tooltip: 'Latency is the round trip to each service, every minute.',
  },
}

export const Loading: Story = { args: { isLoading: true } }

/** Still focusable, so its tooltip can say why. */
export const Disabled: Story = { args: { isDisabled: true, tooltip: 'Already checking.' } }

/** Every state. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-12">
      <IconButton label="Refresh" icon={RefreshIcon} />
      <IconButton label="Run" icon={PlayIcon} iconSize={14} />
      <IconButton label="Refresh" icon={RefreshIcon} isLoading />
      <IconButton label="Refresh" icon={RefreshIcon} isDisabled />
      <IconButton label="Options" icon={MoreVerticalIcon} />
      <IconButton label="Close" icon={CloseIcon} variant="ghost" />
    </div>
  ),
}
