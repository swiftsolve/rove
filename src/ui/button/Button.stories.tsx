import type { Meta, StoryObj } from '@storybook/react-vite'
import { Fragment } from 'react'
import { fn } from 'storybook/test'

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
