import type { Meta, StoryObj } from '@storybook/react-vite'
import { Fragment } from 'react'
import { expect, fn } from 'storybook/test'

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
    docs: { subtitle: 'A button with a word or two on it, for an action.', toc: GUIDANCE_TOC },
    guidance: {
      whenToUse: [
        'The page’s main action, solid: “Run test”.',
        'Stopping that action, solid negative: “Stop”.',
        'Every other action, soft: “Scan again”, “Check now”.',
        'An action on a red surface, soft negative: an error `Banner`’s Dismiss.',
      ],
      whenNotToUse: [
        'Opening another view or an address: use `Link`.',
        'An icon with no words: use `IconButton`.',
        'Checking a field’s value, like Test: use `TextFieldAction`.',
      ],
      accessibility: {
        builtIn: [
          'A native `<button>`, `type="button"` unless set.',
          'Disabled and loading stay focusable, ignore presses and tell screen readers.',
          'Its icon and spinner are hidden from screen readers.',
        ],
        toHandle: [
          'A label that says what happens, like “Run test”.',
          'On a disabled button, a `Tooltip` that says why.',
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

/** A click, Enter and Space each run the action once. */
export const Pressing: Story = {
  args: { variant: 'solid', icon: iconArg('PlayIcon') },
  tags: ['!autodocs'],
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Run test' })
    await userEvent.click(button)
    await expect(args.onClick).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    await expect(args.onClick).toHaveBeenCalledTimes(3)
  },
}

/** Disabled, it still takes focus but ignores a press. */
export const PressingWhileDisabled: Story = {
  args: { variant: 'solid', icon: iconArg('PlayIcon'), isDisabled: true },
  tags: ['!autodocs'],
  play: async ({ args, canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'Run test' })
    await userEvent.keyboard('{Tab}')
    await expect(button).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await userEvent.click(button)
    await expect(args.onClick).not.toHaveBeenCalled()
  },
}

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
