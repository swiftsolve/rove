import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PlayIcon, StopIcon } from '../icons/Icons'
import { Button } from './Button'

const meta = {
  title: 'Actions/Button',
  component: Button,
  args: { children: 'Run test', onClick: fn() },
  argTypes: {
    variant: { control: 'inline-radio', options: ['solid', 'soft', 'ghost'] },
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

/** A quiet second choice beside a soft one. */
export const Ghost: Story = { args: { variant: 'ghost', children: 'Dismiss' } }

export const Loading: Story = { args: { variant: 'solid', icon: PlayIcon, isLoading: true, loadingLabel: 'Testing…' } }

/** Still focusable, so a tooltip can say why. */
export const Disabled: Story = { args: { variant: 'solid', icon: PlayIcon, isDisabled: true } }

/** Every variant in every state. */
export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-12">
      {([
        { variant: 'solid' },
        { variant: 'solid', tone: 'negative' },
        { variant: 'soft' },
        { variant: 'soft', size: 'md' },
        { variant: 'ghost' },
      ] as const).map((appearance) => (
        <div key={JSON.stringify(appearance)} className="flex flex-wrap items-center gap-12">
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
        </div>
      ))}
    </div>
  ),
}
