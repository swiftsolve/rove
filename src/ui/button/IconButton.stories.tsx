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
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'A frequent action an icon says on its own: refresh, help, close.',
        'Soft, the default, as a chip in a header or a toolbar.',
        '`variant="ghost"` where a chip would be heavy, like a dialog’s close.',
        'A help button, with the hint in `tooltip`.',
      ],
      avoid: [
        'An action that needs words: use `Button`.',
        'Several actions behind one icon: use `Menu`.',
        'Opening another view: use `Link`.',
        'An item’s tile that opens it: use `IconTileButton`.',
      ],
      states: [
        'Hover and press, while usable.',
        '`isLoading` swaps the icon for a spinner of the same size.',
        '`isDisabled` dims it.',
        'Icon sizes: 16, or 14 for an icon that reads large (Play).',
      ],
      accessibility: {
        builtIn: [
          'A native `<button>`, `type="button"` unless set: Enter and Space press it.',
          '`label` names it and is its tooltip. The icon is hidden from screen readers.',
          'The tooltip opens on hover and keyboard focus. A `tooltip` that says more is read as its description.',
          'A focus ring on keyboard focus.',
          'Disabled and loading stay focusable, ignore every press and tell screen readers (`aria-disabled`, `aria-busy`).',
        ],
        yours: [
          'A `label` that says what happens: “Close”, not “X”.',
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
