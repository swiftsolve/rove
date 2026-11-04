import type { Meta, StoryObj } from '@storybook/react-vite'
import { Fragment } from 'react'
import { fn } from 'storybook/test'

import { type Guidance, GUIDANCE_TOC } from '../../../.storybook/docs-page'
import { iconArg, iconComponentControl } from '../icons/icon-options'
import { PlayIcon } from '../icons/Icons'
import { Button } from './Button'

const meta = {
  title: 'Actions/Button',
  component: Button,
  args: { children: 'Run test', onClick: fn() },
  argTypes: {
    variant: { control: 'inline-radio', options: ['solid', 'soft'] },
    tone: { control: 'inline-radio', options: ['neutral', 'accent', 'negative'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    icon: iconComponentControl,
  },
  parameters: {
    docs: { toc: GUIDANCE_TOC },
    guidance: {
      use: [
        'An action on this page: running a test, adding a device, retrying.',
        'Solid for the page’s main action, with `tone="negative"` to stop what it started.',
        'Soft for everything else, like a card’s Reset.',
        'Soft with `tone="negative"` on a red surface, like an error Banner’s Dismiss.',
        'A form’s submit button, with `type="submit"`.',
      ],
      avoid: [
        'Opening another view or an address: use `Link`.',
        'An icon with no words: use `IconButton`.',
        'Picking one of a few options: use `SegmentedControl`.',
        'Turning a setting on or off: use `Toggle`.',
      ],
      accessibility: {
        builtIn: [
          'A native `<button>`, `type="button"` unless set: Enter and Space press it.',
          'A focus ring on keyboard focus.',
          'Disabled and loading stay focusable, so a tooltip can say why. Both ignore every press, a submit included, and tell screen readers (`aria-disabled`, `aria-busy`).',
          'The icon is hidden from screen readers. The label names the button.',
        ],
        youHandle: [
          'A label that says what happens: “Run test”, not “OK”.',
          'On a disabled button, a tooltip that says why.',
          'A `loadingLabel` when the wait needs words.',
        ],
      },
    } satisfies Guidance,
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

/** A page's main action. */
export const Solid: Story = { args: { variant: 'solid', icon: iconArg('PlayIcon') } }

/** Stopping what the main action started. */
export const SolidNegative: Story = {
  args: { variant: 'solid', tone: 'negative', icon: iconArg('StopIcon'), children: 'Stop' },
}

/** Everything else. */
export const Soft: Story = { args: { variant: 'soft' } }

/** On a red surface, like an error Banner's Dismiss and Retry. */
export const SoftNegative: Story = { args: { variant: 'soft', tone: 'negative', children: 'Dismiss' } }

export const Loading: Story = {
  args: { variant: 'solid', icon: iconArg('PlayIcon'), isLoading: true, loadingLabel: 'Testing…' },
}

/** Still focusable, so a tooltip can say why. */
export const Disabled: Story = { args: { variant: 'solid', icon: iconArg('PlayIcon'), isDisabled: true } }

/** Every variant in every state. */
export const AllStates: Story = {
  render: () => (
    // A grid, so each state's column lines up across sizes.
    <div className="grid grid-cols-[repeat(4,max-content)] items-center justify-items-start gap-12">
      {(
        [
          { variant: 'solid' },
          { variant: 'solid', tone: 'negative' },
          { variant: 'soft' },
          { variant: 'soft', tone: 'negative' },
          { variant: 'soft', size: 'md' },
        ] as const
      ).map((appearance) => (
        <Fragment key={JSON.stringify(appearance)}>
          <Button {...appearance}>Label</Button>
          <Button {...appearance} icon={PlayIcon}>
            With icon
          </Button>
          <Button {...appearance} icon={PlayIcon} isLoading>
            Loading
          </Button>
          <Button {...appearance} icon={PlayIcon} isDisabled>
            Disabled
          </Button>
        </Fragment>
      ))}
    </div>
  ),
}
