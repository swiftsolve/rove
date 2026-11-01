import { Fragment } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PlayIcon, StopIcon } from '../icons/Icons'
import { Button } from './Button'

const meta = {
  title: 'Actions/Button',
  component: Button,
  args: { children: 'Run test', onClick: fn() },
  argTypes: {
    variant: { control: 'inline-radio', options: ['solid', 'soft'] },
    tone: { control: 'inline-radio', options: ['accent', 'negative'], if: { arg: 'variant', eq: 'solid' } },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    icon: { control: false },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

/** A page's main action. */
export const Solid: Story = { args: { variant: 'solid', icon: PlayIcon } }

/** Stopping what the main action started. */
export const SolidNegative: Story = { args: { variant: 'solid', tone: 'negative', icon: StopIcon, children: 'Stop' } }

/** Everything else. */
export const Soft: Story = { args: { variant: 'soft' } }

export const Loading: Story = { args: { variant: 'solid', icon: PlayIcon, isLoading: true, loadingLabel: 'Testing…' } }

/** Still focusable, so a tooltip can say why. */
export const Disabled: Story = { args: { variant: 'solid', icon: PlayIcon, isDisabled: true } }

/** Every variant in every state. */
export const AllStates: Story = {
  render: () => (
    // A grid, so each state's column lines up across sizes.
    <div className="grid grid-cols-[repeat(4,max-content)] items-center justify-items-start gap-12">
      {([
        { variant: 'solid' },
        { variant: 'solid', tone: 'negative' },
        { variant: 'soft' },
        { variant: 'soft', size: 'md' },
      ] as const).map((appearance) => (
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
